import unittest

from server import FaraRuntimeCache, route_api


class FakeClock:
    def __init__(self, value=1000.0):
        self.value=value
    def __call__(self):
        return self.value


class DynamicFaraRuntimeTests(unittest.TestCase):
    def test_registry_is_loaded_at_runtime_and_refreshed_after_24_hours(self):
        clock=FakeClock()
        calls=[]
        version={'n':0}
        def registry_loader():
            version['n']+=1
            calls.append(version['n'])
            return {
                'summary':{'schemaVersion':1,'countryCount':version['n'],'countries':{'IL':{'principals':version['n']}}},
                'countries':{'IL':{'schemaVersion':1,'countryCode':'IL','registeredPrincipals':version['n'],'principals':[]}}
            }
        cache=FaraRuntimeCache(registry_loader=registry_loader,insight_loader=lambda iso,report:[],clock=clock,ttl_seconds=86400)
        self.assertEqual(cache.get_summary()['countryCount'],1)
        self.assertEqual(cache.get_country('IL')['registeredPrincipals'],1)
        self.assertEqual(calls,[1])

        clock.value+=86399
        self.assertEqual(cache.get_summary()['countryCount'],1)
        self.assertEqual(calls,[1])

        clock.value+=2
        self.assertEqual(cache.get_summary()['countryCount'],2)
        self.assertEqual(calls,[1,2])

    def test_country_insights_are_runtime_cached_and_refreshed_without_database(self):
        clock=FakeClock()
        registry=lambda:{
            'summary':{'schemaVersion':1,'countries':{'IL':{'principals':1}}},
            'countries':{'IL':{'schemaVersion':1,'countryCode':'IL','principals':[{'registrationNumber':'7553'}]}}
        }
        calls=[]
        def insight_loader(iso,report):
            calls.append((iso,report['countryCode']))
            return [{'registrationNumber':'7553','schemaVersion':3,'servicesSummary':'Tourism promotion'}]
        cache=FaraRuntimeCache(registry_loader=registry,insight_loader=insight_loader,clock=clock,ttl_seconds=86400)

        first=cache.get_country_insights('IL',background=False)
        self.assertEqual(first['status'],'ready')
        self.assertEqual(first['insights'][0]['registrationNumber'],'7553')
        self.assertEqual(len(calls),1)

        second=cache.get_country_insights('IL',background=False)
        self.assertEqual(second['insights'][0]['registrationNumber'],'7553')
        self.assertEqual(len(calls),1)

        clock.value+=86401
        cache.get_country_insights('IL',background=False)
        self.assertEqual(len(calls),2)

    def test_api_routes_serve_runtime_summary_country_and_insights(self):
        registry=lambda:{
            'summary':{'schemaVersion':1,'countryCount':1,'countries':{'IL':{'principals':2}}},
            'countries':{'IL':{'schemaVersion':1,'countryCode':'IL','registeredPrincipals':2,'principals':[]}}
        }
        cache=FaraRuntimeCache(registry_loader=registry,insight_loader=lambda iso,report:[],ttl_seconds=86400)

        status,summary=route_api('/api/fara/summary',cache)
        self.assertEqual(status,200)
        self.assertEqual(summary['countryCount'],1)

        status,country=route_api('/api/fara/country/IL',cache)
        self.assertEqual(status,200)
        self.assertEqual(country['countryCode'],'IL')

        status,insights=route_api('/api/fara/country/IL/insights',cache,background_insights=False)
        self.assertEqual(status,200)
        self.assertEqual(insights['status'],'ready')

        status,error=route_api('/api/fara/country/ZZZ',cache)
        self.assertEqual(status,400)
        self.assertIn('country code',error['error'].lower())


if __name__=='__main__':
    unittest.main()
