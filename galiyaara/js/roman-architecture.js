/**
 * POLITICS / Galiyaara — Roman Corinthian engaged colonnade.
 *
 * Architecture-only extension to the original WebGL hallway. The layout
 * places each arch and its two wall-mounted supports BETWEEN portrait bays,
 * not across any framed photo. Shared geometries and instancing keep a long
 * corridor affordable on desktops and phones.
 */

/** Return the paired floor-column/roof-arch locations. No Three.js needed. */
export function corinthianColumnPositions({halfWidth,start,seg,archSpacing,length}){
  const valid=[halfWidth,start,seg,archSpacing,length].every(Number.isFinite);
  if(!valid||halfWidth<=0||seg<=0||archSpacing<=0||length<=start+seg)return {arches:[],columns:[]};
  const firstArchZ=-(start+seg/2);
  const arches=[],columns=[];
  const count=Math.max(1,Math.ceil((length-start-18)/archSpacing));
  for(let i=0;i<count;i++){
    const z=firstArchZ-i*archSpacing;
    arches.push({z,index:i});
    for(const side of [-1,1]){
      columns.push({x:side*(halfWidth-0.05),z,side,archIndex:i});
    }
  }
  return {arches,columns};
}

/** A carved acanthus shape for the two foliage wreaths of the capitals. */
function acanthusLeafGeometry(THREE){
  const leaf=new THREE.Shape();
  leaf.moveTo(0,0);
  leaf.lineTo(-0.067,0.070);
  leaf.lineTo(-0.107,0.099);
  leaf.lineTo(-0.058,0.124);
  leaf.lineTo(-0.123,0.169);
  leaf.lineTo(-0.059,0.182);
  leaf.lineTo(-0.098,0.242);
  leaf.lineTo(-0.039,0.251);
  leaf.lineTo(0,0.363);
  leaf.lineTo(0.039,0.251);
  leaf.lineTo(0.098,0.242);
  leaf.lineTo(0.059,0.182);
  leaf.lineTo(0.123,0.169);
  leaf.lineTo(0.058,0.124);
  leaf.lineTo(0.107,0.099);
  leaf.lineTo(0.067,0.070);
  leaf.closePath();
  return new THREE.ExtrudeGeometry(leaf,{
    depth:0.022,steps:1,bevelEnabled:true,bevelSegments:1,
    bevelSize:0.009,bevelThickness:0.008,curveSegments:2
  });
}

/** Subtle lengthwise channels cut into the fluted Roman shaft. */
function flutedShaftGeometry(THREE,height,lowPower){
  const geo=new THREE.CylinderGeometry(0.213,0.242,height,lowPower?48:96,1);
  const positions=geo.attributes.position;
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i),y=positions.getY(i);
    const angle=Math.atan2(z,x);
    // Twelve flutes, with softened troughs rather than a corrugated pipe.
    const flute=0.965+0.035*Math.cos(angle*12);
    positions.setXYZ(i,x*flute,y,z*flute);
  }
  positions.needsUpdate=true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build floor-to-arch Corinthian supports: plinth and toroidal base moldings,
 * narrow fluted shafts, double acanthus-leaf capitals, volutes and abaci.
 * The columns are engaged against the corridor's existing wallpaper walls.
 */
export function createCorinthianColonnade(THREE,{columns,archSpringY=6.99,lowPower=false}){
  const group=new THREE.Group();
  group.name='POLITICS Roman Corinthian wall columns';
  const rows=Array.isArray(columns)?columns:[];
  if(!rows.length)return group;

  // The foot of each engaged column is on the existing hallway floor.
  const base={y:0,height:0.16};
  const count=rows.length;
  const shaftBottom=0.47;
  const shaftTop=archSpringY-0.78;
  const shaftHeight=shaftTop-shaftBottom;
  const limestone=new THREE.MeshStandardMaterial({
    color:0xc8c0af,roughness:0.89,metalness:0.005
  });
  const ivory=new THREE.MeshStandardMaterial({
    color:0xe0d6c1,roughness:0.81,metalness:0.01
  });
  const stoneShadow=new THREE.MeshStandardMaterial({
    color:0x8b857d,roughness:0.93,metalness:0
  });

  const matrix=new THREE.Matrix4();
  const rotation=new THREE.Quaternion();
  const identity=new THREE.Quaternion();
  const size=new THREE.Vector3(1,1,1);
  const point=new THREE.Vector3();

  function instanced(geometry,material,items,compose){
    const mesh=new THREE.InstancedMesh(geometry,material,items);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for(let i=0;i<items;i++){
      const transform=compose(i);
      matrix.compose(
        point.set(transform.x,transform.y,transform.z),
        transform.rotation||identity,
        transform.scale||size
      );
      mesh.setMatrixAt(i,matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    // The gallery itself already manages near/far texture loading. These
    // architectural instance batches span many hundreds of metres.
    mesh.frustumCulled=false;
    group.add(mesh);
    return mesh;
  }

  // A classical Roman plinth and three slightly different toroidal base rings.
  instanced(new THREE.BoxGeometry(.68,base.height,.68),stoneShadow,count,i=>({
    x:rows[i].x,y:base.y+base.height/2,z:rows[i].z
  }));
  instanced(new THREE.BoxGeometry(.56,.12,.57),limestone,count,i=>({
    x:rows[i].x,y:0.215,z:rows[i].z
  }));
  instanced(new THREE.CylinderGeometry(.276,.288,.12,lowPower?16:24),ivory,count,i=>({
    x:rows[i].x,y:0.335,z:rows[i].z
  }));
  const ringGeo=new THREE.TorusGeometry(.244,.031,lowPower?5:8,lowPower?16:26);
  const ringRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
  instanced(ringGeo,limestone,count,i=>({
    x:rows[i].x,y:0.426,z:rows[i].z,rotation:ringRotation
  }));

  // The fluted shaft rises continuously from the base to the carved capital.
  instanced(flutedShaftGeometry(THREE,shaftHeight,lowPower),limestone,count,i=>({
    x:rows[i].x,y:(shaftTop+shaftBottom)/2,z:rows[i].z
  }));
  instanced(new THREE.TorusGeometry(.218,.028,6,lowPower?16:24),ivory,count,i=>({
    x:rows[i].x,y:shaftTop+.027,z:rows[i].z,rotation:ringRotation
  }));

  // The Corinthian capital: tapered bell, two tiers of raised acanthus leaves,
  // stone-carved volute scrolls on the visible face, and a squared abacus
  // directly beneath the end of its matching sky arch.
  const bellY=archSpringY-.515;
  instanced(new THREE.CylinderGeometry(.315,.220,.47,lowPower?16:24),limestone,count,i=>({
    x:rows[i].x,y:bellY,z:rows[i].z
  }));
  const leafCount=lowPower?6:10;
  const leafGeometry=acanthusLeafGeometry(THREE);
  for(const [tier,yOffset,radius] of [
    [0,archSpringY-.765,.238],
    [1,archSpringY-.608,.276]
  ]){
    const items=count*leafCount;
    const leafM=new THREE.Matrix4();
    const leafQ=new THREE.Quaternion();
    const leafPos=new THREE.Vector3();
    const leafScale=new THREE.Vector3(1,1,1);
    const mesh=new THREE.InstancedMesh(leafGeometry,tier===0?ivory:limestone,items);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for(let col=0;col<count;col++){
      for(let j=0;j<leafCount;j++){
        const theta=Math.PI*2*j/leafCount+(tier?Math.PI/leafCount:0);
        leafQ.setFromAxisAngle(new THREE.Vector3(0,1,0),theta);
        leafPos.set(
          rows[col].x+Math.sin(theta)*radius,
          yOffset,
          rows[col].z+Math.cos(theta)*radius
        );
        leafM.compose(leafPos,leafQ,leafScale);
        mesh.setMatrixAt(col*leafCount+j,leafM);
      }
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.frustumCulled=false;
    group.add(mesh);
  }

  // Twin carved spiral volutes face into the hallway beneath the abacus.
  const voluteGeo=new THREE.TorusGeometry(.083,.020,lowPower?5:7,lowPower?12:20,Math.PI*1.77);
  const voluteQ=[-1,1].map(side=>
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),side*Math.PI/2)
  );
  instanced(voluteGeo,ivory,count*2,k=>{
    const c=rows[Math.floor(k/2)],offset=k%2? .17:-.17;
    return {
      x:c.x-c.side*.257,
      y:archSpringY-.28,
      z:c.z+offset,
      rotation:voluteQ[c.side===-1?0:1]
    };
  });
  // Abacus and lip give the arc a real-looking structural spring point.
  instanced(new THREE.BoxGeometry(.65,.145,.64),ivory,count,i=>({
    x:rows[i].x,y:archSpringY-.0725,z:rows[i].z
  }));
  instanced(new THREE.BoxGeometry(.70,.056,.69),limestone,count,i=>({
    x:rows[i].x,y:archSpringY-.008,z:rows[i].z
  }));

  // Decorative seams are separate instanced meshes, not wall panel dividers.
  group.userData.columnCount=count;
  group.userData.style='Roman Corinthian';
  group.userData.archSpringY=archSpringY;
  return group;
}
