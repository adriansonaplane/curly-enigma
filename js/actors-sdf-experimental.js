// Development experiment only. This file is intentionally not loaded by index.html.
// Load it from the benchmark page; Actors3 remains the production actor renderer.
'use strict';

const SDFActorsExperimental = (() => {
  const MAX_PRIMITIVES = 8;
  const TYPE = Object.freeze({ sphere: 0, capsule: 1, box: 2 });

  // A bounded, allocation-free description copied into every actor record. Smooth
  // union is limited to the two body lobes; hard unions keep eyes crisp.
  const BLOB = Object.freeze([
    { type: TYPE.sphere, a: [0, .42, 0], b: [.55, .44, .55], smooth: .12 },
    { type: TYPE.sphere, a: [0, .66, 0], b: [.34, .26, .34], smooth: .10 },
    { type: TYPE.capsule, a: [-.22, .22, 0], b: [-.31, .06, .02], r: .11, smooth: 0 },
    { type: TYPE.box, a: [.20, .08, -.12], b: [.13, .08, .16], smooth: 0 },
    { type: TYPE.sphere, a: [-.14, .60, .34], b: [.07, .07, .07], eye: true, smooth: 0 },
    { type: TYPE.sphere, a: [.14, .60, .34], b: [.07, .07, .07], eye: true, smooth: 0 },
  ]);

  function actor(x, z, size, color) {
    return {
      x, z, size: size || 1, yaw: 0, phase: 0, color: new THREE.Color(color || 0x718b3b),
      // Fixed capacity makes update cost predictable and prevents shader topology drift.
      primitiveCount: BLOB.length,
      primitives: BLOB.concat(Array(MAX_PRIMITIVES - BLOB.length).fill(null)),
    };
  }

  function material() {
    return new THREE.ShaderMaterial({
      fog: true, transparent: false, depthTest: true, depthWrite: true,
      extensions: { fragDepth: true },
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        lightDir: { value: new THREE.Vector3(.35, .8, .25).normalize() },
        ambient: { value: .24 }, time: { value: 0 },
      }]),
      vertexShader: `
        attribute vec3 actorColor; attribute float actorPhase; attribute vec3 actorOrigin; attribute float actorSize; attribute float actorYaw;
        varying vec3 vEntry; varying vec3 vColor; varying float vPhase;
        varying vec3 vCameraLocal;
        void main(){
          vEntry=position; vColor=actorColor; vPhase=actorPhase;
          vec3 d=(cameraPosition-actorOrigin)/actorSize; float c=cos(actorYaw),s=sin(actorYaw);
          vCameraLocal=vec3(c*d.x-s*d.z,d.y,s*d.x+c*d.z);
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 lightDir; uniform float ambient; uniform float time;
        varying vec3 vEntry; varying vec3 vColor; varying float vPhase; varying vec3 vCameraLocal;
        float ellipsoid(vec3 p,vec3 c,vec3 r){ vec3 q=(p-c)/r; return (length(q)-1.)*min(r.x,min(r.y,r.z)); }
        float capsule(vec3 p,vec3 a,vec3 b,float r){ vec3 pa=p-a,ba=b-a; return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.))-r; }
        float boxSdf(vec3 p,vec3 c,vec3 b){ vec3 q=abs(p-c)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
        float su(float a,float b,float k){ float h=max(k-abs(a-b),0.)/k; return min(a,b)-h*h*k*.25; }
        vec2 scene(vec3 p){
          float wobble=1.+sin(time*6.+vPhase)*.08; p.xz/=wobble;
          float d=ellipsoid(p,vec3(0,.42,0),vec3(.55,.44,.55));
          d=su(d,ellipsoid(p,vec3(0,.66,0),vec3(.34,.26,.34)),.10);
          d=min(d,capsule(p,vec3(-.22,.22,0),vec3(-.31,.06,.02),.11));
          d=min(d,boxSdf(p,vec3(.20,.08,-.12),vec3(.13,.08,.16)));
          float e=min(ellipsoid(p,vec3(-.14,.60,.34),vec3(.07)),ellipsoid(p,vec3(.14,.60,.34),vec3(.07)));
          return e<d?vec2(e,1.):vec2(d,0.);
        }
        vec3 normalAt(vec3 p){ vec2 e=vec2(.002,0); float d=scene(p).x; return normalize(vec3(scene(p+e.xyy).x-d,scene(p+e.yxy).x-d,scene(p+e.yyx).x-d)); }
        void main(){
          vec3 rd=normalize(vEntry-vCameraLocal); float t=0.; vec3 p; vec2 hit;
          for(int i=0;i<64;i++){ p=vCameraLocal+rd*t; hit=scene(p); if(hit.x<.001) break; t+=hit.x; if(t>3.) discard; }
          if(hit.x>=.001) discard;
          vec3 n=normalAt(p); float diffuse=max(dot(n,lightDir),0.); vec3 base=hit.y>.5?vec3(1.,.32,.08):vColor;
          gl_FragColor=vec4(base*(ambient+diffuse*.76),1.);
          vec4 clip=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);
          gl_FragDepthEXT=clip.z/clip.w*.5+.5;
          #include <fog_fragment>
        }`,
    });
  }

  function create(capacity = 40) {
    const geometry = new THREE.BoxGeometry(1.3, 1.05, 1.3).translate(0, .52, 0);
    geometry.setAttribute('actorColor', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    geometry.setAttribute('actorPhase', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    geometry.setAttribute('actorOrigin', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    geometry.setAttribute('actorSize', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    geometry.setAttribute('actorYaw', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    const mesh = new THREE.InstancedMesh(geometry, material(), capacity);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    const actors = [], matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    return {
      mesh, actors, shadowPolicy: 'SDF actors receive approximate directional light but neither cast nor receive shadow-map shadows.',
      add(x, z, size, color) { if (actors.length >= capacity) throw new Error('SDF actor capacity exceeded'); const a = actor(x, z, size, color); actors.push(a); return a; },
      update(time) {
        const started = performance.now(), colors = geometry.attributes.actorColor, phases = geometry.attributes.actorPhase;
        const origins = geometry.attributes.actorOrigin, sizes = geometry.attributes.actorSize, yaws = geometry.attributes.actorYaw;
        for (let i = 0; i < actors.length; i++) { const a = actors[i];
          rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.yaw); scale.setScalar(a.size);
          matrix.compose(new THREE.Vector3(a.x, 0, a.z), rotation, scale); mesh.setMatrixAt(i, matrix);
          colors.setXYZ(i, a.color.r, a.color.g, a.color.b); phases.setX(i, a.phase);
          origins.setXYZ(i, a.x, 0, a.z); sizes.setX(i, a.size);
          yaws.setX(i, a.yaw);
        }
        mesh.count = actors.length;
        mesh.instanceMatrix.needsUpdate = colors.needsUpdate = phases.needsUpdate = origins.needsUpdate = sizes.needsUpdate = yaws.needsUpdate = true;
        mesh.material.uniforms.time.value = time;
        return performance.now() - started;
      },
      dispose() { geometry.dispose(); mesh.material.dispose(); },
    };
  }
  return Object.freeze({ MAX_PRIMITIVES, TYPE, BLOB, create });
})();
