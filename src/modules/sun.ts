import * as THREE from 'three';
import { canvasTex, sphereDir } from '../core/util';

/* Slnko: fotosféra (biele svetlo) a chromosféra s protuberanciami (H-alfa) – všetko počítané shaderom. */
const SUN_SPOTS: number[][] =[[14,20,0.055],[17,34,0.03],[-12,-40,0.045],[-19,100,0.04]]; // šírka, dĺžka, polomer
const sunDir=sphereDir;
const GLSL_NOISE=`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
`;
export const SUN_U={uTime:{value:0},uHa:{value:0},uSpots:{value:SUN_SPOTS.map(s=>{const d=sunDir(s[0],s[1]);return new THREE.Vector4(d.x,d.y,d.z,s[2]);})}};
export function sunMaterial(){
  return new THREE.ShaderMaterial({uniforms:SUN_U,
    vertexShader:`varying vec3 vPos;varying vec3 vN;varying vec3 vView;
      void main(){vPos=position;vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:GLSL_NOISE+`
      uniform float uTime;uniform float uHa;uniform vec4 uSpots[4];
      varying vec3 vPos;varying vec3 vN;varying vec3 vView;
      void main(){
        vec3 p=normalize(vPos);
        float mu=clamp(dot(normalize(vN),normalize(vView)),0.0,1.0);
        // granulácia: bunky horúcej plazmy
        float g1=snoise(p*34.0+vec3(0.0,uTime*0.06,uTime*0.03));
        float g2=snoise(p*70.0-vec3(uTime*0.05,0.0,0.0));
        float gran=0.5+0.5*(0.7*g1+0.3*g2);
        float big=0.5+0.5*snoise(p*5.0+vec3(uTime*0.01));
        // slnečné škvrny (umbra a penumbra)
        float um=0.0,pen=0.0,plage=0.0;
        for(int i=0;i<4;i++){float d=distance(p,uSpots[i].xyz);float r=uSpots[i].w;
          um=max(um,1.0-smoothstep(r*0.42,r*0.55,d));pen=max(pen,1.0-smoothstep(r*0.85,r*1.05,d));plage=max(plage,1.0-smoothstep(r*1.2,r*3.2,d));}
        // biele svetlo
        vec3 col=mix(vec3(1.0,0.72,0.32),vec3(1.0,0.96,0.84),smoothstep(0.3,0.75,gran));
        col*=0.93+0.1*big;
        float limb=1.0-0.6*(1.0-mu)-0.2*(1.0-mu*mu);
        col*=limb;col=mix(col,col*vec3(1.0,0.7,0.45),pow(1.0-mu,1.5));
        col=mix(col,col*vec3(0.75,0.55,0.4),pen);col=mix(col,vec3(0.12,0.05,0.02),um);
        col+=vec3(0.12,0.1,0.06)*plage*pow(1.0-mu,1.5);
        // H-alfa: chromosféra, vlákna, aktívne oblasti
        float mott=0.5+0.5*(0.6*snoise(p*18.0+vec3(uTime*0.03))+0.4*snoise(p*45.0));
        float fil=1.0-smoothstep(0.015,0.06,abs(snoise(p*2.6+vec3(4.0,1.0,uTime*0.004))));
        fil*=smoothstep(0.45,0.7,0.5+0.5*snoise(p*1.8+vec3(9.0)));
        vec3 ha=vec3(0.95,0.33,0.1)*(0.55+0.5*mott);
        ha*=1.0-0.65*fil;
        ha+=vec3(0.6,0.45,0.25)*plage*0.6;ha=mix(ha,vec3(0.25,0.06,0.02),um*0.8);
        ha*=0.72+0.28*mu;
        gl_FragColor=vec4(mix(col,ha,uHa),1.0);
      }`});
}
/* okraj chromosféry (spikuly) – viditeľný v H-alfa */
function sunRimMaterial(){
  return new THREE.ShaderMaterial({uniforms:SUN_U,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`varying vec3 vPos;varying vec3 vN;varying vec3 vView;
      void main(){vPos=position;vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:GLSL_NOISE+`uniform float uTime;uniform float uHa;varying vec3 vPos;varying vec3 vN;varying vec3 vView;
      void main(){float mu=abs(dot(normalize(vN),normalize(vView)));
        float rim=pow(1.0-mu,4.0);
        float sp=0.55+0.45*snoise(normalize(vPos)*60.0+vec3(0.0,0.0,uTime*0.3));
        float a=rim*sp*(0.25+0.95*uHa);
        gl_FragColor=vec4(mix(vec3(1.0,0.75,0.4),vec3(1.0,0.3,0.1),uHa)*a,a);}`});
}
/* protuberancie: oblúky plazmy nad povrchom */
const PROMS=[[-5,-80,16,0.34],[25,60,12,0.2],[-30,150,20,0.5],[8,-160,9,0.16],[40,-20,14,0.26],[-45,40,10,0.18],[2,110,8,0.3],[60,170,12,0.15]];
function promMaterial(seed: number){
  return new THREE.ShaderMaterial({uniforms:{uTime:SUN_U.uTime,uHa:SUN_U.uHa,uSeed:{value:seed}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`varying vec2 vUv;varying float vOut;
      void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.0);
        vec3 c=(modelViewMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;float R=length((modelViewMatrix*vec4(1.0,0.0,0.0,0.0)).xyz);
        float ang=acos(clamp(dot(normalize(mv.xyz),normalize(c)),-1.0,1.0));float angR=asin(clamp(R/length(c),0.0,1.0));
        vOut=smoothstep(angR*0.99,angR*1.05,ang);   // 1 = mimo disku (nad okrajom), 0 = pred diskom
        gl_Position=projectionMatrix*mv;}`,
    fragmentShader:GLSL_NOISE+`uniform float uTime;uniform float uHa;uniform float uSeed;varying vec2 vUv;varying float vOut;
      void main(){float n=0.5+0.5*snoise(vec3(vUv.x*10.0+uSeed,vUv.y*3.0,uTime*0.3+uSeed));
        float n2=0.5+0.5*snoise(vec3(vUv.x*30.0-uSeed,vUv.y*6.0,uTime*0.6));
        float ends=smoothstep(0.0,0.1,vUv.x)*smoothstep(1.0,0.9,vUv.x);
        float edge=sin(3.14159*vUv.y);  // jemnejšie okraje trubice
        float a=(0.25+0.6*n+0.35*n2)*ends*(0.3+0.7*edge)*uHa*mix(0.12,1.0,vOut);
        gl_FragColor=vec4(vec3(1.0,0.35+0.3*n,0.12+0.1*n2)*a,a);}`});
}
export function buildSunExtras(mesh: THREE.Mesh){
  const rim=new THREE.Mesh(new THREE.SphereGeometry(1.025,64,32),sunRimMaterial());mesh.add(rim);
  PROMS.forEach((pr,i)=>{
    for(let s=0;s<3;s++){  // každá protuberancia z troch prepletených vlákien
      const j=(s-1)*pr[2]*0.12;
      const a=sunDir(pr[0]+j,pr[1]-pr[2]/2),b=sunDir(pr[0]+pr[2]*0.25-j,pr[1]+pr[2]/2);
      const pts: THREE.Vector3[]=[];for(let k=0;k<=32;k++){const t=k/32;const v=a.clone().lerp(b,t).normalize();
        const wob=1+0.06*Math.sin(t*9+i+s*2);v.multiplyScalar(1+pr[3]*(0.85+0.15*s)*Math.sin(Math.PI*t)*wob);pts.push(v);}
      const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),80,0.014+pr[3]*0.035*(1-0.25*s),10,false),promMaterial(i*7.3+s*3.1));
      mesh.add(tube);
    }
  });
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d')!;
  const gr=g.createRadialGradient(128,128,40,128,128,128);gr.addColorStop(0,'rgba(255,220,150,0.55)');gr.addColorStop(0.45,'rgba(255,170,80,0.18)');gr.addColorStop(1,'rgba(255,140,60,0)');
  g.fillStyle=gr;g.fillRect(0,0,256,256);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:canvasTex(c),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  glow.scale.set(3.4,3.4,1);glow.renderOrder=-1;mesh.add(glow);
}

