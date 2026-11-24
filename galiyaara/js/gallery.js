/**
 * Galiyaara — the corridor.
 *
 * A moonlit open-air arcade that runs into the fog. Photographs hang between
 * the arches, each one lighting its own patch of wall and floor. Nothing here
 * is loaded from a CDN and nothing is baked: the corridor is generated from
 * photos.json at runtime, so its length is however many photographs exist.
 *
 * Cheap by design — the artworks are unlit (MeshBasicMaterial, tone mapping
 * off) so the photographs render at their true colour, and every "light" they
 * appear to cast is additive geometry rather than a real light. The only real
 * lights in the scene are the moon and an image-based environment derived from
 * the sky itself.
 */
import * as THREE from '../vendor/three.module.min.js';
import {advanceCorridorZ,wheelCorridorMetres} from '../../assets/js/issue-corridor-navigation.js';
import {createCorinthianColonnade,corinthianColumnPositions,ROMAN_ENGAGEMENT_DEPTH,ROMAN_ARCH_TUBE_RADIUS} from './roman-architecture.js';

// --- Corridor dimensions (metres) -------------------------------------------
const HALF_W = 3.5;      // wall at x = ±HALF_W
const SEG = 3.0;         // one photograph per wall every 3 metres; opposite parties face each other
const START = 5.5;       // first pair of portraits is visible near the entrance
const EYE = 1.62;
const ART_Y = 2.05;      // centre height of a hung photograph
const ART_H = 2.05;      // nominal height; wide images are capped by ART_MAX_W
const ART_MAX_W = 3.0;

const LOAD_D = 72;       // metres: pull a photograph's texture in
const DROP_D = 120;      // metres: let it go again

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** Frame-rate independent easing: how far to move toward a target this frame. */
const ease = (dt, speed) => 1 - Math.exp(-speed * dt);

// --- Procedural textures ----------------------------------------------------

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft round falloff — used for glows, light pools and stars. */
const radialTex = () => canvasTex(256, 256, (g, w) => {
  const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, w);
});

/** Old plaster: warm grey, blotchy, with vertical weathering streaks. */
const plasterTex = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#6a6058';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const r = 8 + Math.random() * 46;
    g.fillStyle = `rgba(${150 + Math.random() * 80 | 0},${136 + Math.random() * 70 | 0},${120 + Math.random() * 60 | 0},${0.02 + Math.random() * 0.05})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.09})`;
    g.fillRect(Math.random() * w, 0, 1 + Math.random() * 6, h);
  }
});

/** Gradient that fades away from the wall, so reflections don't end in a line. */
const fadeTex = () => canvasTex(4, 128, (g, w, h) => {
  const grd = g.createLinearGradient(0, h, 0, 0);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.45, '#3a3a3a');
  grd.addColorStop(1, '#000000');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
});

/** A shaft of light, brightest where it leaves the lamp. */
const beamTex = () => canvasTex(64, 256, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const side = g.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)');
  side.addColorStop(0.5, 'rgba(0,0,0,1)');
  side.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = side;
  g.fillRect(0, 0, w, h);
});

/** The little brass plate under each frame. */
const plaqueTex = (title, office) => canvasTex(640, 152, (g, w, h) => {
  g.fillStyle = '#171512';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#aa9067';
  g.strokeRect(5, 5, w-10, h-10);
  g.textAlign = 'center';
  g.fillStyle = '#fff1d7';
  g.font = '600 46px Georgia, serif';
  g.fillText(title, w/2, 65, w-40);
  g.fillStyle = '#e2ceb0';
  g.font = '34px Georgia, serif';
  g.fillText(office || '', w/2, 120, w-40);
});

// --- Sky --------------------------------------------------------------------

const SKY_VERT = `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `
  varying vec3 vP;
  uniform vec3 horizon; uniform vec3 zenith;
  void main(){
    float h = normalize(vP).y;
    vec3 c = mix(horizon, zenith, smoothstep(-0.15, 0.75, h));
    gl_FragColor = vec4(c, 1.0);
  }`;

function buildSky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      horizon: { value: new THREE.Color(0x121a2c) },
      zenith: { value: new THREE.Color(0x03040a) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(450, 32, 20), mat);
}

function buildStars(sprite) {
  const N = 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    // Extend slightly below the horizon for views through the end window.
    const theta = Math.random() * Math.PI * 2;
    const y = Math.random() * 1.12 - 0.12;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(theta) * r * 420, y * 420, Math.sin(theta) * r * 420], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: sprite, size: 3, sizeAttenuation: false, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfe0ff, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function buildMeteor() {
  const segments = 24;
  const positions = new Float32Array(segments * 6);
  const colors = new Float32Array(positions.length);
  const color = new THREE.Color(0xbcd9ff);
  for (let i = 0; i < segments * 2; i++) {
    const strength = Math.pow(1 - Math.ceil(i / 2) / segments, 1.7);
    colors.set([color.r * strength, color.g * strength, color.b * strength], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, toneMapped: false,
  });
  const meteor = new THREE.LineSegments(geometry, material);
  meteor.frustumCulled = false;
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const point = new THREE.Vector3();
  let event = -1;

  return {
    meteor,
    update(time, eye, yaw) {
      const interval = 7;
      const elapsed = time % interval;
      meteor.visible = elapsed < 1.4;
      if (!meteor.visible) return;
      const nextEvent = Math.floor(time / interval);
      if (event !== nextEvent) {
        event = nextEvent;
        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        right.set(-forward.z, 0, forward.x);
        const direction = event % 2 === 0 ? 1 : -1;
        origin.copy(eye).addScaledVector(forward, 155).addScaledVector(right, -62 * direction);
        origin.y += 84;
        velocity.copy(right).multiplyScalar(102 * direction);
        velocity.y = -26;
      }
      for (let i = 0; i < segments * 2; i++) {
        const lag = Math.ceil(i / 2) / segments * 0.38;
        point.copy(origin).addScaledVector(velocity, Math.max(0, elapsed - lag));
        position.setXYZ(i, point.x, point.y, point.z);
      }
      position.needsUpdate = true;
      material.opacity = Math.min(elapsed * 12, (1.4 - elapsed) * 3, 0.95);
    },
  };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function planetSurfaceTex(name) {
  const seed = [...name].reduce((sum,ch)=>sum+ch.charCodeAt(0),0) * 997;
  const rand = seededRandom(seed);
  return canvasTex(1024, 512, (g, w, h) => {
    const band = (y0,y1,a,b) => {
      const grad = g.createLinearGradient(0,y0,0,y1);
      grad.addColorStop(0,a); grad.addColorStop(1,b);
      g.fillStyle = grad; g.fillRect(0,y0,w,y1-y0);
    };
    const speckles = (count,color,min=1,max=7) => {
      g.fillStyle = color;
      for(let i=0;i<count;i++){
        const r=min+rand()*(max-min);
        g.beginPath(); g.arc(rand()*w,rand()*h,r,0,Math.PI*2); g.fill();
      }
    };

    if(name==='Mercury'){
      band(0,h,'#77736d','#3f3d39');
      speckles(460,'rgba(28,26,24,.28)',1,8);
      speckles(180,'rgba(214,205,193,.16)',1,5);
      for(let i=0;i<38;i++){
        const x=rand()*w,y=rand()*h,r=4+rand()*16;
        const grd=g.createRadialGradient(x-r*.25,y-r*.25,1,x,y,r);
        grd.addColorStop(0,'rgba(210,203,193,.22)');
        grd.addColorStop(.48,'rgba(75,70,65,.34)');
        grd.addColorStop(1,'rgba(25,24,22,.08)');
        g.fillStyle=grd; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
      }
    }else if(name==='Venus'){
      band(0,h,'#d79e4b','#8e5f2c');
      for(let i=0;i<120;i++){
        const y=rand()*h,amp=8+rand()*28;
        g.strokeStyle=`rgba(255,224,157,${.08+rand()*.18})`;
        g.lineWidth=3+rand()*12; g.beginPath(); g.moveTo(-20,y);
        for(let x=0;x<=w+30;x+=42)g.lineTo(x,y+Math.sin(x*.015+rand()*6)*amp);
        g.stroke();
      }
      speckles(110,'rgba(101,55,20,.13)',2,11);
    }else if(name==='Earth'){
      const ocean=g.createLinearGradient(0,0,w,h);
      ocean.addColorStop(0,'#0b4f91'); ocean.addColorStop(.5,'#1475b9'); ocean.addColorStop(1,'#082f6b');
      g.fillStyle=ocean; g.fillRect(0,0,w,h);
      const land=(pts,fill)=>{
        g.fillStyle=fill; g.beginPath();
        pts.forEach(([x,y],i)=>i?g.lineTo(x*w,y*h):g.moveTo(x*w,y*h));
        g.closePath(); g.fill();
      };
      land([[.05,.24],[.11,.14],[.19,.12],[.27,.19],[.29,.29],[.24,.37],[.19,.44],[.12,.40],[.08,.31]],'#5f8d49');
      land([[.22,.43],[.29,.47],[.34,.57],[.33,.73],[.28,.88],[.23,.75],[.20,.57]],'#65944e');
      land([[.43,.19],[.51,.13],[.64,.14],[.76,.23],[.80,.31],[.72,.38],[.63,.36],[.56,.43],[.48,.38]],'#638f48');
      land([[.49,.40],[.58,.42],[.63,.52],[.61,.68],[.55,.82],[.49,.72],[.46,.55]],'#6e984e');
      land([[.80,.58],[.87,.56],[.92,.63],[.91,.72],[.84,.75],[.78,.68]],'#739c54');
      speckles(170,'rgba(194,169,93,.12)',1,5);
      for(let i=0;i<46;i++){
        const y=rand()*h,x=rand()*w,len=24+rand()*80;
        g.strokeStyle=`rgba(255,255,255,${.07+rand()*.14})`;
        g.lineWidth=2+rand()*6; g.beginPath(); g.arc(x,y,len,0.2,2.7); g.stroke();
      }
      g.fillStyle='rgba(245,251,255,.88)'; g.fillRect(0,0,w,h*.035); g.fillRect(0,h*.965,w,h*.035);
    }else if(name==='Mars'){
      band(0,h,'#b85632','#6e2c24');
      speckles(320,'rgba(77,31,24,.16)',1,8);
      speckles(120,'rgba(230,146,92,.12)',2,8);
      for(let i=0;i<26;i++){
        const x=rand()*w,y=rand()*h,r=8+rand()*22;
        g.fillStyle='rgba(62,28,28,.14)'; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
      }
      g.fillStyle='rgba(245,235,218,.82)'; g.fillRect(0,0,w,h*.025); g.fillRect(0,h*.975,w,h*.025);
    }else if(name==='Jupiter'){
      const colors=['#caa17e','#e5c19a','#a97258','#f0d0a4','#b87955','#dcc09c','#8f614e','#e9ca9f','#bd8b68'];
      let y=0;
      while(y<h){
        const hh=24+rand()*46;
        g.fillStyle=colors[Math.floor(rand()*colors.length)];
        g.fillRect(0,y,w,hh);
        y+=hh;
      }
      for(let i=0;i<70;i++){
        g.strokeStyle=`rgba(255,246,220,${.05+rand()*.12})`; g.lineWidth=2+rand()*7;
        const yy=rand()*h; g.beginPath(); g.moveTo(0,yy);
        for(let x=0;x<=w;x+=52)g.lineTo(x,yy+Math.sin(x*.011+rand()*5)*(2+rand()*8));
        g.stroke();
      }
      g.fillStyle='rgba(181,68,47,.88)'; g.beginPath(); g.ellipse(w*.69,h*.61,w*.085,h*.075,-.08,0,Math.PI*2); g.fill();
      g.strokeStyle='rgba(245,179,136,.45)'; g.lineWidth=9; g.stroke();
    }else if(name==='Saturn'){
      const colors=['#ead6a3','#cdb681','#f0dfb2','#bfa875','#e8cf91'];
      let y=0;
      while(y<h){
        const hh=22+rand()*38; g.fillStyle=colors[Math.floor(rand()*colors.length)];
        g.fillRect(0,y,w,hh); y+=hh;
      }
      for(let i=0;i<50;i++){
        g.fillStyle=`rgba(91,67,42,${.025+rand()*.055})`;
        g.fillRect(0,rand()*h,w,1+rand()*3);
      }
    }else if(name==='Uranus'){
      band(0,h,'#93e0e5','#4aa6b8');
      for(let i=0;i<30;i++){
        g.fillStyle=`rgba(225,255,255,${.025+rand()*.08})`; g.fillRect(0,rand()*h,w,2+rand()*6);
      }
    }else if(name==='Neptune'){
      band(0,h,'#346ccc','#102b82');
      for(let i=0;i<42;i++){
        g.fillStyle=`rgba(122,177,255,${.035+rand()*.10})`; g.fillRect(0,rand()*h,w,2+rand()*8);
      }
      g.fillStyle='rgba(9,22,78,.55)'; g.beginPath(); g.ellipse(w*.64,h*.58,w*.07,h*.05,-.18,0,Math.PI*2); g.fill();
      g.fillStyle='rgba(181,215,255,.34)'; g.beginPath(); g.ellipse(w*.27,h*.37,w*.055,h*.025,.1,0,Math.PI*2); g.fill();
    }
  });
}

function sunSurfaceTex() {
  const rand=seededRandom(93117);
  return canvasTex(1024,512,(g,w,h)=>{
    const base=g.createLinearGradient(0,0,0,h);
    base.addColorStop(0,'#fff0a6'); base.addColorStop(.35,'#ffb92f'); base.addColorStop(.72,'#f17414'); base.addColorStop(1,'#ffc93f');
    g.fillStyle=base; g.fillRect(0,0,w,h);
    for(let i=0;i<900;i++){
      const x=rand()*w,y=rand()*h,r=1+rand()*8;
      g.fillStyle=`rgba(255,255,210,${.04+rand()*.15})`; g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
    }
    for(let i=0;i<55;i++){
      const x=rand()*w,y=rand()*h,r=2+rand()*10;
      g.fillStyle=`rgba(156,55,8,${.05+rand()*.16})`; g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
    }
  });
}

const PLANET_SPECS=[
  {name:'Mercury', radius:.18, orbit:1.65, speed:.72, spin:.32, tilt:2, phase:.2},
  {name:'Venus', radius:.25, orbit:2.12, speed:.54, spin:-.17, tilt:177, phase:1.1},
  {name:'Earth', radius:.27, orbit:2.72, speed:.43, spin:.72, tilt:23.4, phase:2.0},
  {name:'Mars', radius:.22, orbit:3.28, speed:.35, spin:.66, tilt:25, phase:2.8},
  {name:'Jupiter', radius:.58, orbit:4.15, speed:.23, spin:1.02, tilt:3, phase:3.6},
  {name:'Saturn', radius:.49, orbit:5.05, speed:.18, spin:.94, tilt:26.7, phase:4.3},
  {name:'Uranus', radius:.33, orbit:5.92, speed:.14, spin:-.58, tilt:98, phase:5.1},
  {name:'Neptune', radius:.32, orbit:6.72, speed:.115, spin:.61, tilt:28, phase:5.8},
];

function buildEndWindowSolarSystem(lowPower = false, reduced = false) {
  const group=new THREE.Group();
  group.name='End-window full solar system';

  const sun=new THREE.Mesh(
    new THREE.SphereGeometry(.92,lowPower?32:56,lowPower?20:36),
    new THREE.MeshBasicMaterial({map:sunSurfaceTex(),toneMapped:false,fog:false})
  );
  sun.name='Sun';
  group.add(sun);

  const glowTexture=radialTex();
  const corona=new THREE.Sprite(new THREE.SpriteMaterial({
    map:glowTexture,color:0xffc34f,transparent:true,opacity:.68,
    blending:THREE.AdditiveBlending,depthWrite:false,fog:false,toneMapped:false
  }));
  corona.scale.set(3.4,3.4,1);
  group.add(corona);
  const coronaWide=new THREE.Sprite(new THREE.SpriteMaterial({
    map:glowTexture,color:0xff9d32,transparent:true,opacity:.20,
    blending:THREE.AdditiveBlending,depthWrite:false,fog:false,toneMapped:false
  }));
  coronaWide.scale.set(5.2,5.2,1);
  group.add(coronaWide);

  const orbitPlane=new THREE.Group();
  orbitPlane.rotation.x=.33;
  orbitPlane.rotation.z=-.11;
  group.add(orbitPlane);

  const moving=[];
  for(const spec of PLANET_SPECS){
    const orbit=new THREE.Mesh(
      new THREE.RingGeometry(spec.orbit-.009,spec.orbit+.009,lowPower?64:128),
      new THREE.MeshBasicMaterial({
        color:0x7891b5,transparent:true,opacity:spec.name==='Jupiter'||spec.name==='Saturn'?.18:.13,
        side:THREE.DoubleSide,depthWrite:false,fog:false,toneMapped:false
      })
    );
    orbit.rotation.x=Math.PI/2;
    orbitPlane.add(orbit);

    const pivot=new THREE.Group();
    pivot.rotation.y=spec.phase;
    orbitPlane.add(pivot);

    const body=new THREE.Group();
    body.position.x=spec.orbit;
    body.rotation.z=THREE.MathUtils.degToRad(spec.tilt);
    pivot.add(body);

    const planet=new THREE.Mesh(
      new THREE.SphereGeometry(spec.radius,lowPower?28:48,lowPower?18:32),
      new THREE.MeshStandardMaterial({
        map:planetSurfaceTex(spec.name),
        roughness:spec.name==='Earth'?.72:.86,
        metalness:0,
        emissive:spec.name==='Neptune'?0x07122f:0x080604,
        emissiveIntensity:.12,
        fog:false
      })
    );
    planet.name=spec.name;
    body.add(planet);

    if(spec.name==='Earth'){
      const atmosphere=new THREE.Mesh(
        new THREE.SphereGeometry(spec.radius*1.045,lowPower?24:40,lowPower?16:26),
        new THREE.MeshBasicMaterial({
          color:0x62aaff,transparent:true,opacity:.10,side:THREE.BackSide,
          blending:THREE.AdditiveBlending,depthWrite:false,fog:false,toneMapped:false
        })
      );
      body.add(atmosphere);
    }

    if(spec.name==='Saturn'){
      const ring=new THREE.Mesh(
        new THREE.RingGeometry(spec.radius*1.35,spec.radius*2.25,lowPower?72:144),
        new THREE.MeshBasicMaterial({
          color:0xd8c08c,transparent:true,opacity:.72,side:THREE.DoubleSide,
          depthWrite:false,fog:false,toneMapped:false
        })
      );
      ring.name='Saturn ring';
      ring.rotation.x=Math.PI/2;
      body.add(ring);
      const ringGap=new THREE.Mesh(
        new THREE.RingGeometry(spec.radius*1.72,spec.radius*1.82,lowPower?72:144),
        new THREE.MeshBasicMaterial({
          color:0x201a15,transparent:true,opacity:.46,side:THREE.DoubleSide,
          depthWrite:false,fog:false,toneMapped:false
        })
      );
      ringGap.rotation.x=Math.PI/2;
      body.add(ringGap);
    }

    moving.push({spec,pivot,planet});
  }

  return {
    group,
    update(t){
      if(reduced)return;
      sun.rotation.y=t*.09;
      corona.material.opacity=.62+Math.sin(t*1.7)*.08;
      coronaWide.material.opacity=.18+Math.sin(t*.9+.6)*.04;
      for(const {spec,pivot,planet} of moving){
        pivot.rotation.y=spec.phase+t*spec.speed;
        planet.rotation.y=t*spec.spin;
      }
    }
  };
}

function namePanel(photo) {
  return canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = '#172631';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b89d72';
    g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#f3e5cb';
    g.textAlign = 'center';
    g.font = '600 28px Georgia, serif';
    g.fillText(photo.title, w / 2, 155, w - 54);
    g.fillStyle = '#d1dce4';
    g.font = '15px sans-serif';
    g.fillText(photo.caption || '', w / 2, 185, w - 54);
    g.font = '12px sans-serif';
    g.fillText('PORTRAIT UNAVAILABLE', w / 2, 270, w - 54);
  });
}

// --- Main -------------------------------------------------------------------

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Array} photos  entries from photos.json
 * @param {{onFocus:Function, onPass:Function, onReady:Function}} hooks
 */
export function createGallery(canvas, photos, hooks = {}, options = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Any touch device (phone or tablet) gets the lighter path: a 2x-DPR tablet
  // asking for a 2048x2732 render is how you get eight frames a second.
  const lowPower = matchMedia('(pointer: coarse)').matches
    || matchMedia('(max-width: 820px)').matches
    || navigator.hardwareConcurrency <= 4;
  // Two wall-mounted portraits can share the same corridor bay; all candidates fit.
  const lastBay = photos.reduce((max,photo)=>Math.max(max,Number.isInteger(photo.bay)?photo.bay:0),-1);
  const END_BUFFER = 23;
  const LENGTH = START + (lastBay + 1) * SEG + END_BUFFER;

  // alpha:true is not cosmetic — three derives its clear alpha from it, and a
  // clear alpha of 1 paints the AR framebuffer opaque, burying the passthrough
  // camera under a black rectangle. The corridor is unaffected: the sky sphere
  // covers the frustum, so nothing shows through on the flat page.
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 900);
  camera.rotation.order = 'YXZ';

  // WebXR writes the headset pose straight onto the camera, so the walker's
  // position lives one level up: the rig is the feet, the camera is the head.
  // Outside XR the camera simply sits at eye height above the rig.
  const rig = new THREE.Group();
  rig.position.set(0, 0, -3);
  camera.position.set(0, EYE, 0);
  rig.add(camera);
  scene.add(rig);

  // Where the head actually is in the world — not the same as rig.position once
  // a headset is involved. Everything that measures distance uses this.
  const eye = new THREE.Vector3(0, EYE, -3);
  const syncEye = () => { rig.updateMatrixWorld(true); camera.getWorldPosition(eye); };

  scene.fog = new THREE.FogExp2(0x0b1122, 0.0175);

  // Sky first and alone, so the environment map it generates is pure sky.
  const sky = buildSky();
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(scene, 0, 1, 900).texture;
  pmrem.dispose();

  const soft = radialTex();
  const stars = buildStars(soft);
  scene.add(stars);
  const shootingStar = reduced ? null : buildMeteor();
  if (shootingStar) scene.add(shootingStar.meteor);

  // Moon: one real light, cool, raking down the corridor.
  const moon = new THREE.DirectionalLight(0xa8c0ff, 1.45);
  moon.position.set(-24, 42, 16);
  scene.add(moon, new THREE.HemisphereLight(0x5d6880, 0x241c14, 2.3));
  scene.environmentIntensity = 2.2;

  const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: soft, color: 0xdce8ff, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, opacity: 0.85,
  }));
  moonDisc.position.set(-130, 220, 90);
  moonDisc.scale.setScalar(90);
  scene.add(moonDisc);

  // --- Architecture ---------------------------------------------------------
  const plaster = plasterTex();
  plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
  plaster.repeat.set(LENGTH / 5, 1.4);

  const stone = new THREE.MeshStandardMaterial({ color: 0xfcfcf9, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.64, toneMapped: false });
  const wallMat = new THREE.MeshStandardMaterial({ map: plaster, color: 0x50677a, roughness: 0.95, metalness: 0.0 });

  const endZ = -(LENGTH - 24) - 3;
  const builtLength = 10 - endZ;
  const midZ = (10 + endZ) / 2;
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(builtLength, 7.4), wallMat);
    wall.rotation.y = s * Math.PI / -2;
    wall.position.set(s * HALF_W, 3.7, midZ);
    scene.add(wall);
  }

  // Close the corridor just beyond the walking limit, with a glazed end window.
  const endWall = new THREE.Group();
  endWall.position.z = endZ;
  const windowWidth = 4.6, windowBottom = 0.95, windowTop = 6.1, wallHeight = 7.4;
  const endPanel = (width, height, x, y, material, depth = 0) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    panel.position.set(x, y, depth);
    endWall.add(panel);
  };
  const surround = new THREE.MeshStandardMaterial({ color: 0xa4adb5, roughness: 0.9, side: THREE.DoubleSide });
  const pierWidth = HALF_W - windowWidth / 2;
  for (const side of [-1, 1]) {
    endPanel(pierWidth, wallHeight, side * (HALF_W - pierWidth / 2), wallHeight / 2, surround);
  }
  endPanel(windowWidth, windowBottom, 0, windowBottom / 2, surround);
  endPanel(windowWidth, wallHeight - windowTop, 0, (wallHeight + windowTop) / 2, surround);
  const glazing = new THREE.MeshBasicMaterial({
    color: 0x244a73, opacity: 0.11, transparent: true, depthWrite: false, toneMapped: false,
  });
  const windowHeight = windowTop - windowBottom;
  const windowY = (windowTop + windowBottom) / 2;
  endPanel(windowWidth, windowHeight, 0, windowY, glazing);
  for (const x of [-windowWidth / 2, 0, windowWidth / 2]) {
    endPanel(0.14, windowHeight + 0.16, x, windowY, stone, 0.03);
  }
  for (const y of [windowBottom, windowY, windowTop]) {
    endPanel(windowWidth + 0.14, 0.14, 0, y, stone, 0.03);
  }
  scene.add(endWall);

  // The window is the literal end of the gallery. Beyond the glass is only sky
  // and a small animated solar view — no wall art, wallpaper, floor, or columns.
  const solarSystem = buildEndWindowSolarSystem(lowPower, reduced);
  solarSystem.group.position.set(0, 3.55, endZ - 16);
  scene.add(solarSystem.group);

  // The original Galiyaara corridor carries a continuous wallpaper gallery.
  // Reuse the 25 existing textures across the *entire* hallway rather than
  // showing each once, leaving the remainder as bare plaster.
  const wallpaperImages = Array.isArray(options.wallpapers)
    ? options.wallpapers.filter(path => typeof path === 'string' && path.startsWith('wallpaper/') && /\.(jpe?g|png|webp|avif)$/i.test(path))
    : [];
  const wallpaperLoader = new THREE.TextureLoader();
  const wallPanelWidth = SEG * 3; // seamless horizontal panels, no breaks by columns
  const wallpaperSpan = 6 - endZ;
  const wallPanelCount = Math.ceil(wallpaperSpan / wallPanelWidth);
  const wallpaperGeo = new THREE.PlaneGeometry(wallPanelWidth, 6.85);
  // One material per image, reused across all sections of that wall.
  wallpaperImages.forEach((path, imageIndex) => {
    wallpaperLoader.load(encodeURI(path), tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const material = new THREE.MeshBasicMaterial({
        // Opaque wall surface is drawn BEFORE the foreground portrait frames.
        // Transparent wallpaper panels were visually covering left-side art.
        map: tex, color: 0xaabfca, transparent: false, opacity: 1,
        side: THREE.DoubleSide, depthWrite: true, toneMapped: false
      });
      for (const side of [-1, 1]) {
        for (let j = 0; j < wallPanelCount; j++) {
          const assigned = (j + (side === 1 ? 7 : 0)) % wallpaperImages.length;
          if (assigned !== imageIndex) continue;
          const nearEdge = 6 - j * wallPanelWidth;
          const panelWidth = Math.min(wallPanelWidth, nearEdge - endZ);
          if (panelWidth <= 0) continue;
          const panelZ = nearEdge - panelWidth / 2;
          const geometry = panelWidth === wallPanelWidth
            ? wallpaperGeo
            : new THREE.PlaneGeometry(panelWidth, 6.85);
          const panel = new THREE.Mesh(geometry, material);
          panel.position.set(side * (HALF_W - 0.019), 3.46, panelZ);
          panel.rotation.y = side * -Math.PI / 2;
          scene.add(panel);
        }
      }
    }, undefined, () => { /* a failed wallpaper must not block the hallway */ });
  });

  // Same plaster canvas, re-tiled: as a roughness map it gives the flagstones
  // wet and dry patches instead of one flat sheet of blue.
  const wet = plaster.clone();
  wet.needsUpdate = true;
  wet.wrapS = wet.wrapT = THREE.RepeatWrapping;
  wet.repeat.set(3, LENGTH / 9);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_W * 2, builtLength),
    new THREE.MeshStandardMaterial({
      color: 0x172538, roughness: 0.62, metalness: 0.4, roughnessMap: wet,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = midZ;
  scene.add(floor);

  // Roman Corinthian colonnade, integrated into the ORIGINAL Galiyaara scene.
  // Each engaged floor-to-arch column is on the wall, at a point BETWEEN
  // politicians' portrait bays, preserving the continuous wallpaper.
  const archSpacing = SEG * 4;
  const archSpringY = 6.99;
  const {arches, columns} = corinthianColumnPositions({
    halfWidth: HALF_W, start: START, seg: SEG,
    archSpacing, length: LENGTH - 9
  });
  const archRadius = HALF_W - ROMAN_ENGAGEMENT_DEPTH;
  const arch = new THREE.InstancedMesh(
    new THREE.TorusGeometry(archRadius, ROMAN_ARCH_TUBE_RADIUS, 20, 108, Math.PI), stone, arches.length
  );
  // Rounded inner marble fascia adds depth: the earlier .097m wire arch
  // looked like a thin suspended hoop rather than a load-bearing vault.
  const fasciaStone = new THREE.MeshStandardMaterial({
    color:0xf2f1ed,roughness:.61,metalness:0,
    emissive:0xd0d0cc,emissiveIntensity:.40,toneMapped:false
  });
  const archFascia = new THREE.InstancedMesh(
    new THREE.TorusGeometry(archRadius-.20, .085, 12, 108, Math.PI),
    fasciaStone, arches.length
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const archScale = new THREE.Vector3(1, 0.66, 1);
  for (let i = 0; i < arches.length; i++) {
    // The arc now springs directly over the more visible wall columns.
    arch.setMatrixAt(i,m.compose(
      new THREE.Vector3(0,archSpringY,arches[i].z),
      q.identity(),archScale
    ));
    archFascia.setMatrixAt(i,m.compose(
      new THREE.Vector3(0,archSpringY,arches[i].z+.055),
      q.identity(),archScale
    ));
  }
  arch.instanceMatrix.needsUpdate = true;
  archFascia.instanceMatrix.needsUpdate = true;
  arch.frustumCulled = false;
  archFascia.frustumCulled = false;
  scene.add(arch,archFascia);

  const corinthianColumns=createCorinthianColonnade(THREE,{
    columns,archSpringY,lowPower
  });
  scene.add(corinthianColumns);

  // --- Artworks -------------------------------------------------------------
  const fade = fadeTex();
  const beam = beamTex();
  const artworks = [];
  const pickables = [];

  const glowGeo = new THREE.PlaneGeometry(1, 1);

  photos.forEach((photo, i) => {
    const side = photo.side === -1 ? -1 : 1;
    const bay = Number.isInteger(photo.bay) ? photo.bay : Math.floor(i / 2);
    const z = -(START + bay * SEG);
    const ar = (photo.w || 1) / (photo.h || 1);
    let h = ART_H, w = h * ar;
    if (w > ART_MAX_W) { w = ART_MAX_W; h = w / ar; }

    const tint = new THREE.Color(photo.tint || '#3a3a3a');
    const group = new THREE.Group();
    group.position.set(side * (HALF_W - 0.04), ART_Y, z);
    group.rotation.y = side * -Math.PI / 2;

    // Wall wash — the illusion that the photograph lights the plaster.
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
      map: soft, color: tint, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.scale.set(w * 2.9, h * 2.9, 1);
    glow.position.z = 0.02;
    group.add(glow);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.13, h + 0.13, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x0f1014, roughness: 0.5, metalness: 0.55 })
    );
    board.position.z = 0.055;
    group.add(board);

    const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      color: tint, transparent: true, opacity: 1, toneMapped: false,
    }));
    art.position.z = 0.095;
    art.userData.index = i;
    group.add(art);
    pickables.push(art);

    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.37), new THREE.MeshBasicMaterial({
      map: plaqueTex(photo.title, photo.caption), transparent: true, opacity: 0.9, toneMapped: false,
    }));
    plaque.position.set(0, -h / 2 - 0.28, 0.07);
    group.add(plaque);

    // Floor pool + smeared reflection, both fading away from the wall.
    const refGeo = new THREE.PlaneGeometry(w, 2.1);
    const uv = refGeo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - uv.getY(k)); // mirror
    const reflection = new THREE.Mesh(refGeo, new THREE.MeshBasicMaterial({
      color: tint, alphaMap: fade, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.set(0, -ART_Y + 0.015, 1.06);
    group.add(reflection);

    if (!lowPower) {
      for (const rot of [0, Math.PI / 2]) {
        const shaft = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.15, 2.6), new THREE.MeshBasicMaterial({
          map: beam, color: 0xffe7c4, transparent: true, opacity: 0.1,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        }));
        shaft.position.set(0, h / 2 + 1.0, 0.42);
        shaft.rotation.y = rot;
        group.add(shaft);
      }
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.5, 0.08, 0.22),
        new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.4, metalness: 0.8 })
      );
      lamp.position.set(0, h / 2 + 0.42, 0.34);
      const bulb = new THREE.Sprite(new THREE.SpriteMaterial({
        map: soft, color: 0xffd9a0, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      bulb.scale.setScalar(0.75);
      bulb.position.copy(lamp.position).setY(lamp.position.y - 0.08);
      group.add(lamp, bulb);
    }

    const pool = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
      map: soft, color: tint, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(w * 2.6, 4.4, 1);
    pool.position.set(0, -ART_Y + 0.01, 1.5);
    group.add(pool);

    scene.add(group);
    artworks.push({ photo, group, art, glow, reflection, side, z, w, h, tint, tex: null, level: null, loading: false, failedPortraitUrls: new Set() });
  });

  // --- Dust -------------------------------------------------------------------
  const DUST = lowPower ? 400 : 1400;
  const DUST_D = 90;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos.set([
      (Math.random() - 0.5) * HALF_W * 2,
      Math.random() * 5,
      rig.position.z - Math.random() * DUST_D,
    ], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    map: soft, size: 0.045, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe9c9,
  }));
  dust.frustumCulled = false;
  scene.add(dust);

  // --- Texture streaming ------------------------------------------------------
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  function apply(a, tex, level) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    if (a.tex && a.tex !== tex) a.tex.dispose();
    a.tex = tex;
    a.level = level;
    a.art.material.map = tex;
    a.art.material.color.set(0xffffff);
    a.art.material.needsUpdate = true;
    a.reflection.material.map = tex;
    a.reflection.material.color.set(0xffffff);
    a.reflection.material.needsUpdate = true;
    a.art.material.opacity = 1;
    a.reflection.material.opacity = 0.3;
  }

  function want(a, level) {
    if (a.loading || a.level === level || a.level === 'large' || a.level === 'panel') return;
    const url = [a.photo[level], ...(a.photo.alternates || [])].find(
      source => source && !a.failedPortraitUrls.has(source)
    );
    if (!url) {
      if (!a.tex) apply(a, namePanel(a.photo), 'panel');
      else a.level = level;
      return;
    }
    if (url === a.loadedUrl) {
      a.level = level;
      return;
    }
    a.loading = true;
    loader.load(url, tex => {
      a.loading = false;
      if (!running) { tex.dispose(); return; }
      a.loadedUrl = url;
      apply(a, tex, level);
    }, undefined, () => {
      a.loading = false;
      a.failedPortraitUrls.add(url);
      if (running) want(a, level);
    });
  }

  function release(a) {
    if (!a.tex) return;
    a.tex.dispose();
    a.tex = null; a.level = null; a.loadedUrl = null;
    for (const mat of [a.art.material, a.reflection.material]) {
      mat.map = null;
      mat.color.copy(a.tint);
      mat.needsUpdate = true;
    }
    a.art.material.opacity = 1;
  }

  // --- Input ------------------------------------------------------------------
  const keys = new Set();
  // Scoped event registration lets POLITICS rebuild the gallery after a search
  // without leaving the old instance's camera handlers attached.
  const events = new AbortController();
  const listenCanvas = (name, handler, extra = {}) => canvas.addEventListener(name, handler, {signal:events.signal,...extra});
  const listenWindow = (name, handler) => addEventListener(name, handler, {signal:events.signal});
  const stick = { x: 0, y: 0 };
  const pointer = new THREE.Vector2();     // -1..1, for page-mode parallax
  const raycaster = new THREE.Raycaster();
  let mode = 'page';
  let travelTargetZ = null; // browser wheels, touch swipes and visible walk buttons
  let autoWalk = false;
  let focused = null;                       // index or null
  let scrollT = 0;                          // 0..1 through the page
  let yaw = 0, pitch = 0;
  const vel = new THREE.Vector3();
  let hovered = null;
  let nearest = -1;
  let drift = 0;

  const dock = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, active: false };

  // A guided walk: a route the curator picked, played back frame by frame.
  const HOLD = 7.5;   // seconds in front of each photograph before moving on
  let tour = null;    // { title, stops: number[], at: number, playing: bool, held: number }

  const bySlug = new Map(artworks.map((a, i) => [a.photo.slug, i]));

  function reportTour() {
    hooks.onTour?.(tour && {
      title: tour.title, at: tour.at, total: tour.stops.length, playing: tour.playing,
    });
  }

  function startTour(walk) {
    const stops = walk.slugs.map((s) => bySlug.get(s)).filter((i) => i !== undefined);
    if (!stops.length) return;
    tour = { title: walk.title, stops, at: 0, playing: true, held: 0 };
    if (mode !== 'roam') setMode('roam');
    focus(stops[0]);
    reportTour();
  }

  function stepTour(delta) {
    if (!tour) return;
    const at = tour.at + delta;
    if (at < 0 || at >= tour.stops.length) return endTour();
    tour.at = at;
    tour.held = 0;
    focus(tour.stops[at]);
    reportTour();
  }

  function endTour() {
    if (!tour) return;
    tour = null;
    reportTour();
  }

  function stopAutoWalk(){
    if (!autoWalk) return;
    autoWalk = false;
    hooks.onAutoWalk?.(false);
  }

  function setAutoWalk(enabled){
    const next = !!enabled;
    if (autoWalk === next) return;
    if (next){
      if (focused !== null) unfocus();
      endTour();
      if (mode !== 'roam') setMode('roam');
      travelTargetZ = null;
      vel.set(0, 0, 0);
    }
    autoWalk = next;
    hooks.onAutoWalk?.(autoWalk);
  }

  /** Advance in metres along the hallway, without selecting any picture. */
  function walkBy(metres){
    if (!Number.isFinite(metres) || !metres) return;
    if (focused !== null) unfocus();
    endTour();
    stopAutoWalk();
    if (mode !== 'roam') setMode('roam');
    vel.set(0, 0, 0);
    const z = travelTargetZ === null ? rig.position.z : travelTargetZ;
    travelTargetZ = advanceCorridorZ(z,metres,LENGTH);
  }

  function dockAt(i) {
    const a = artworks[i];
    // Far enough back that the long edge fits the frustum, then turn to face
    // the wall the picture is on (side -1 => look along -X, +1 => along +X).
    const d = Math.max(a.w, a.h) * 1.15 + 0.95;
    // dock.pos is where the *feet* go, so subtract eye height to land the head
    // at the picture's centre. In a headset the feet belong on the floor.
    dock.pos.set(a.side * (HALF_W - 0.04 - d), renderer.xr.isPresenting ? 0 : ART_Y - 0.1 - EYE, a.z);
    dock.yaw = -a.side * Math.PI / 2;
    dock.pitch = 0.04;
    dock.active = true;
  }

  function focus(i, silent) {
    if (i < 0 || i >= artworks.length) return;
    stopAutoWalk();
    travelTargetZ = null;
    focused = i;
    dockAt(i);
    want(artworks[i], 'large');
    if (!silent) hooks.onFocus?.(artworks[i].photo, i);
  }

  function unfocus() {
    endTour();
    if (focused === null) return;
    const a = artworks[focused];
    rig.position.set(0, 0, a.z + 0.6);
    yaw = 0; pitch = 0;
    focused = null;
    dock.active = false;
    hooks.onFocus?.(null, -1);
  }

  function setMode(next) {
    if (next === mode) return;
    if (next === 'page') {
      stopAutoWalk();
      travelTargetZ = null;
      unfocus();
      document.exitPointerLock?.();
    }
    mode = next;
    if (next === 'roam') { yaw = 0; pitch = 0; }
    hooks.onMode?.(mode);
  }

  // Pointer look (pointer lock on desktop, drag on touch)
  let dragging = false, dragMoved = 0, lastX = 0, lastY = 0;

  // Scroll/trackpad continuously moves the walker through the hallway.
  // Only events on the 3D canvas are intercepted: the issue sheet still scrolls.
  listenCanvas('wheel', (e) => {
    if (e.ctrlKey) return; // preserve browser pinch-to-zoom gestures
    const metres = wheelCorridorMetres(e.deltaY, e.deltaMode);
    if (!metres) return;
    e.preventDefault();
    walkBy(metres);
  }, {passive:false});

  listenCanvas('pointerdown', (e) => {
    dragging = true; dragMoved = 0; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  listenCanvas('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (document.pointerLockElement === canvas) {
      yaw -= e.movementX * 0.0022;
      pitch = clamp(pitch - e.movementY * 0.0022, -1.1, 1.1);
    } else if (dragging && mode === 'roam' && focused === null) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      if (e.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx) * 1.1 && Math.abs(dy) > 1) {
        // Swipe up to move forward; swipe down to return. Horizontal swipes
        // still turn the camera, preserving Galiyaara's original look control.
        walkBy(-dy * 0.055);
      } else {
        yaw -= dx * 0.004;
        pitch = clamp(pitch - dy * 0.004, -1.1, 1.1);
      }
      lastX = e.clientX; lastY = e.clientY;
    }
  });

  listenCanvas('pointerup', (e) => {
    dragging = false;
    if (dragMoved > 8) return;             // that was a look, not a click
    raycaster.setFromCamera(
      document.pointerLockElement === canvas ? new THREE.Vector2(0, 0) : pointer, camera
    );
    const hit = raycaster.intersectObjects(pickables, false).find(hit => hit.object.parent.visible);
    if (hit) {
      if (mode === 'page') setMode('roam');
      endTour();
      focus(hit.object.userData.index);
    } else if (focused !== null) {
      unfocus();
    }
    e.preventDefault();
  });

  listenCanvas('dblclick', () => {
    if (mode === 'roam' && focused === null && !matchMedia('(pointer: coarse)').matches) {
      canvas.requestPointerLock?.();
    }
  });

  listenWindow('keydown', (e) => {
    // Text-entry controls should never accidentally drive the camera.
    if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === 'Escape') {
      if (focused !== null) unfocus();
      else if (mode === 'roam') setMode('page');
      return;
    }
    if (mode !== 'roam') return;
    if (focused !== null) {
      const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
      if (e.code === 'Space' && tour) {
        tour.playing = !tour.playing;
        reportTour();
        e.preventDefault();
        return;
      }
      if (tour) { if (fwd) stepTour(1); if (back) stepTour(-1); return; }
      if (fwd) focus(focused + 1);
      if (back) focus(focused - 1);
      return;
    }
    if (/^(Key[WASD]|Arrow)/.test(e.code)) travelTargetZ = null;
    if (/^(Key[WASD]|Arrow)/.test(e.code)) stopAutoWalk();
    keys.add(e.code);
    if (/^(Key[WASD]|Arrow|Space)/.test(e.code)) e.preventDefault();
  });
  listenWindow('keyup', (e) => keys.delete(e.code));
  listenWindow('blur', () => keys.clear());

  // --- Frame ------------------------------------------------------------------
  const clock = new THREE.Clock();
  let running = true;

  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    if (canvas.width === w * renderer.getPixelRatio() && camera.aspect === w / h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function walk(dt) {
    const f = clamp((keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + stick.y + (autoWalk ? 0.5 : 0), -1, 1);
    const s = clamp((keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x, -1, 1);
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.4 : 1;
    const accel = 34 * boost;
    vel.x += (Math.cos(yaw) * s + Math.sin(yaw) * -f) * accel * dt;
    vel.z += (Math.sin(yaw) * s + Math.cos(yaw) * f * -1) * accel * dt;
    vel.multiplyScalar(Math.exp(-7 * dt));
    rig.position.x = clamp(rig.position.x + vel.x * dt, -HALF_W + 0.55, HALF_W - 0.55);
    rig.position.z = clamp(rig.position.z + vel.z * dt, -(LENGTH - 24), 10);
    if (autoWalk && rig.position.z <= -(LENGTH-24) + 0.04) stopAutoWalk();
    camera.position.y = EYE + (reduced ? 0 : Math.sin(performance.now() * 0.004) * 0.012 * vel.length());
  }

  function tick(time, frame) {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const inXR = renderer.xr.isPresenting;
    if (!inXR) resize();

    if (inXR) {
      // Thumbstick wins over a dock — pushing off cancels the glide.
      if (xrMove?.(dt, frame)) dock.active = false;
      // Aiming the trigger at a frame in VR has to actually walk you up to it;
      // outside XR the dock branch below does that, and in XR nothing did.
      // AR never docks: over passthrough the corridor is not there to walk.
      else if (dock.active && renderScene === scene) {
        rig.position.lerp(dock.pos, reduced ? 1 : ease(dt, 5.5));
        rig.position.y = 0;                       // in a headset the floor is the floor
        if (Math.hypot(rig.position.x - dock.pos.x, rig.position.z - dock.pos.z) < 0.08) {
          dock.active = false;
        }
      }
    } else if (dock.active) {
      const k = reduced ? 1 : ease(dt, 5.5);
      rig.position.lerp(dock.pos, k);
      yaw = lerp(yaw, dock.yaw, k);
      pitch = lerp(pitch, dock.pitch, k);
      vel.set(0, 0, 0);
    } else if (mode === 'roam') {
      if (travelTargetZ !== null) {
        const k = reduced ? 1 : ease(dt, 5);
        rig.position.z = lerp(rig.position.z, travelTargetZ, k);
        rig.position.x = lerp(rig.position.x, 0, ease(dt, 3));
        vel.set(0, 0, 0);
        if (Math.abs(rig.position.z - travelTargetZ) < 0.025) travelTargetZ = null;
      } else {
        walk(dt);
      }
    } else {
      // Page mode: scroll pulls you down the corridor, with a slow drift on top
      // so the shot is never completely still.
      if (!reduced) drift += dt * 0.55;
      const target = 6 - (scrollT * 30 * SEG) - drift;
      rig.position.z = lerp(rig.position.z, target, ease(dt, 2.2));
      rig.position.x = lerp(rig.position.x, pointer.x * 0.75, ease(dt, 2));
      camera.position.y = lerp(camera.position.y, EYE + pointer.y * 0.16 + (reduced ? 0 : Math.sin(drift * 1.6) * 0.02), ease(dt, 2));
      yaw = lerp(yaw, -pointer.x * 0.16, ease(dt, 2));
      pitch = lerp(pitch, pointer.y * 0.08, ease(dt, 2));
    }

    // Hold in front of each stop, but only once the camera has actually settled
    // there — otherwise a slow dock eats into the time you get to look at it.
    if (tour && tour.playing && focused !== null) {
      if (rig.position.distanceTo(dock.pos) < 0.25) tour.held += dt;
      if (tour.held >= HOLD) {
        if (tour.at + 1 >= tour.stops.length) endTour();
        else stepTour(1);
      }
    }

    if (!inXR) camera.rotation.set(pitch, yaw, 0);   // in XR the headset decides
    syncEye();
    sky.position.copy(eye);
    stars.position.copy(eye);
    shootingStar?.update(time * 0.001 + 5, eye, yaw);
    moonDisc.position.set(eye.x - 130, 220, eye.z + 90);
    solarSystem.update(time * 0.001);

    // Stream textures and breathe the glows.
    const t = performance.now() * 0.001;
    let best = Infinity, bestI = -1;
    for (let i = 0; i < artworks.length; i++) {
      const a = artworks[i];
      const d = Math.abs(a.z - eye.z);
      if (d < LOAD_D) want(a, 'thumb');
      else if (d > DROP_D && i !== focused) release(a);

      a.group.visible = Boolean(a.tex) && (d < LOAD_D + 16 || i === focused);

      if (d < LOAD_D) {
        const pulse = 0.8 + Math.sin(t * 0.9 + i) * 0.05;
        a.glow.material.opacity = i === hovered || i === focused ? pulse + 0.28 : pulse;
        if (d < best) { best = d; bestI = i; }
      }
    }
    if (bestI !== nearest) { nearest = bestI; hooks.onPass?.(bestI >= 0 ? artworks[bestI].photo : null, bestI); }

    // Hover highlight (skipped while docked — nothing else is clickable then).
    if (focused === null && !dragging && !inXR) {
      raycaster.setFromCamera(document.pointerLockElement === canvas ? new THREE.Vector2(0, 0) : pointer, camera);
      const hit = raycaster.intersectObjects(pickables, false).find(hit => hit.object.parent.visible);
      const idx = hit ? hit.object.userData.index : null;
      if (idx !== hovered) {
        hovered = idx;
        canvas.style.cursor = idx === null ? '' : 'pointer';
        hooks.onHover?.(idx === null ? null : artworks[idx].photo, idx ?? -1);
      }
    }

    // Infinite dust: wrap the slab around the camera instead of making more.
    const p = dustGeo.attributes.position;
    for (let i = 0; i < DUST; i++) {
      let y = p.getY(i) + dt * 0.06;
      if (y > 5) y -= 5;
      p.setY(i, y);
      const dz = p.getZ(i) - eye.z;
      if (dz > DUST_D / 2) p.setZ(i, p.getZ(i) - DUST_D);
      else if (dz < -DUST_D / 2) p.setZ(i, p.getZ(i) + DUST_D);
    }
    p.needsUpdate = true;

    renderer.render(renderScene, camera);
  }

  let xrMove = null;
  let renderScene = scene;   // AR swaps in its own, so passthrough is not buried under a corridor
  resize();
  renderer.setAnimationLoop(tick);
  hooks.onReady?.();

  return {
    setMode: (m) => setMode(m),
    getMode: () => mode,
    focus,
    unfocus,
    next: () => (tour ? stepTour(1) : focus(focused === null ? 0 : focused + 1)),
    prev: () => (tour ? stepTour(-1) : focus(focused === null ? 0 : focused - 1)),
    /** Drop the camera straight to an artwork without the walk. */
    jumpTo(i) {
      endTour();
      const a = artworks[clamp(i, 0, artworks.length - 1)];
      rig.position.set(0, 0, a.z + 5);
      setMode('roam');
      focus(i);
    },
    setScroll: (t) => { scrollT = clamp(t, 0, 1); },
    walkBy,
    setAutoWalk,
    getAutoWalk: () => autoWalk,
    startTour,
    stepTour,
    endTour,
    toggleTour() { if (tour) { tour.playing = !tour.playing; reportTour(); } },
    setStick: (x, y) => {
      if (x || y) { travelTargetZ = null; stopAutoWalk(); }
      stick.x = x; stick.y = y;
    },
    /** Full-resolution texture for a photograph — used by the AR print. */
    loadTexture: (url) => loader.loadAsync(url).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      return t;
    }),
    count: artworks.length,
    dispose() { running = false; stopAutoWalk(); events.abort(); renderer.setAnimationLoop(null); renderer.dispose(); },

    /** What the XR layer needs to drive the same corridor from a headset. */
    xr: {
      renderer, scene, camera, rig,
      focusAt: focus,
      pickables,
      photoAt: (i) => artworks[i]?.photo || null,
      setMover(fn) { xrMove = fn; },
      setScene(s) { renderScene = s || scene; },
      corridor: { HALF_W, LENGTH, EYE },
    },
  };
}
