// GLSL sources. Three passes run every frame:
//   1. BG_FS    paints the world behind the glass into a mipmapped buffer
//   2. FOG_FS   evolves the breath condensation layer (ping-pong buffer)
//   3. GLASS_FS ray-casts the tilted pane and refracts the world through it

const NOISE = /* glsl */ `
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float gnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  float a=dot(hash22(i)*2.-1.,f),b=dot(hash22(i+vec2(1,0))*2.-1.,f-vec2(1,0));
  float c=dot(hash22(i+vec2(0,1))*2.-1.,f-vec2(0,1)),d=dot(hash22(i+vec2(1,1))*2.-1.,f-vec2(1,1));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float fbm(vec2 p){float s=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){s+=a*gnoise(p);p=m*p;a*=.5;}return s;}
`;

export const VS = /* glsl */ `#version 300 es
in vec2 a;
void main(){gl_Position=vec4(a,0.,1.);}`;

/* ------------------------------------------------------------------ */
/* 1. The world behind the glass                                       */
/* ------------------------------------------------------------------ */
export const BG_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;uniform float uTime;uniform vec2 uLight;uniform vec2 uPar;uniform float uMargin;
uniform int uScene;uniform vec3 uSunCol;uniform float uSunPow;uniform vec3 uGrade;uniform float uExpo;
uniform sampler2D uImg;uniform float uImgAsp;uniform float uMirror;
out vec4 o;
${NOISE}
vec3 bokeh(vec2 p,float dens,vec3 c1,vec3 c2,float soft){
  vec3 acc=vec3(0.);vec2 i=floor(p);
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 cell=i+vec2(x,y);vec2 h=hash22(cell);
    vec2 ctr=cell+.15+.7*h;float r=.16+.26*fract(h.x*7.13);
    float b=smoothstep(r,r*soft,length(p-ctr));
    float on=step(1.-dens,fract(h.y*13.7));
    acc+=b*on*mix(c1,c2,fract(h.x*3.7+h.y*1.3));
  }
  return acc;
}
vec3 garden(vec2 q,vec2 uv,float t,vec2 ls){
  vec2 w=q;
  w.x+=.03*sin(t*.42+q.y*2.1)+.012*sin(t*1.1+q.y*6.3);
  w.y+=.012*sin(t*.57+q.x*2.7);
  float f=fbm(w*2.+vec2(3.1,1.7));
  float g=fbm(w*4.3+vec2(f*1.3,-f)+11.);
  vec3 col=mix(vec3(.008,.03,.012),vec3(.025,.075,.03),uv.y);
  float leaves=smoothstep(-.12,.3,f+.4*g);
  vec3 leaf=mix(vec3(.03,.13,.035),vec3(.12,.36,.07),smoothstep(-.2,.4,g));
  col=mix(col,leaf,leaves);
  float dl=length(q-ls);
  float lit=smoothstep(.18,.55,g+.35*f)*leaves;
  col=mix(col,vec3(.5,.7,.15),lit*(.25+.75*exp(-dl*1.1)));
  col+=bokeh(w*5.,.4,vec3(.25,.5,.08),vec3(.72,.78,.28),.35)*.45*(.6+.4*exp(-dl*.8));
  return col;
}
vec3 forest(vec2 q,vec2 uv,float t){
  float x=q.x+.006*sin(t*.5+q.y*3.);
  vec3 sky=mix(vec3(.72,.84,.9),vec3(.95,.97,.93),uv.y);
  float canopy=fbm(vec2(x*2.2,q.y*1.1)+vec2(0.,3.));
  float leaf=fbm(vec2(x*6.,q.y*3.)+canopy+t*.02);
  vec3 col=mix(vec3(.05,.18,.06),vec3(.5,.7,.2),smoothstep(-.3,.45,leaf));
  float gap=smoothstep(.2,.45,canopy+uv.y*.5-.25);
  col=mix(col,sky,gap*.85);
  float tn=gnoise(vec2(x*4.3,.5))+.3*gnoise(vec2(x*13.,q.y*.6));
  col=mix(col,vec3(.04,.07,.035),(1.-smoothstep(.03,.1,abs(tn)))*.85);
  float tn2=gnoise(vec2(x*9.1+7.,.2));
  col=mix(col,vec3(.12,.2,.08),(1.-smoothstep(.02,.06,abs(tn2)))*.6);
  return col;
}
vec3 city(vec2 q,vec2 uv,float t){
  vec3 col=mix(vec3(.05,.04,.045),vec3(.34,.29,.26),pow(clamp(uv.y,0.,1.),.8));
  col=mix(col,vec3(.03,.025,.03),smoothstep(.42,.3,uv.y)*.85);
  col+=vec3(.25,.11,.04)*smoothstep(.6,0.,uv.y)*.5;
  col+=bokeh(q*3.2,.35,vec3(1.,.55,.15),vec3(1.,.8,.45),.5)*1.2;
  col+=bokeh(q*6.5+3.,.4,vec3(1.,.9,.75),vec3(.9,.3,.15),.4)*.8;
  float band=smoothstep(.12,0.,abs(uv.y-.3));
  col+=bokeh(vec2(q.x*9.-t*.35,q.y*9.),.5,vec3(1.,.25,.12),vec3(1.,.95,.8),.4)*band*.8;
  col+=bokeh(q*14.+9.,.25,vec3(.4,.8,1.),vec3(1.,.7,.4),.3)*.35;
  return col;
}
vec3 sunset(vec2 q,vec2 uv,float t){
  vec3 col=mix(vec3(.98,.74,.62),vec3(.72,.55,.68),smoothstep(.05,.55,uv.y));
  col=mix(col,vec3(.36,.3,.48),smoothstep(.5,1.,uv.y));
  float cl=fbm(vec2(q.x*1.5+t*.01,q.y*4.));
  col=mix(col,col*vec3(.75,.7,.85),smoothstep(-.1,.4,cl)*.6);
  return col;
}
vec3 vases(vec2 uv,float asp){
  vec2 p=(uv-.5)*vec2(asp,1.);
  float k=min(asp,1.);
  vec3 col=mix(vec3(.66,.55,.4),vec3(.8,.7,.54),uv.y);
  col=mix(col,vec3(.3,.34,.4)*(.75+.6*uv.y),smoothstep(.36,.33,uv.y));
  vec2 b=(p-vec2(-.33*k,-.06))/vec2(.17*k+.03,.31);
  float bd=length(b*vec2(1.,1.+.25*b.y));
  vec3 blue=mix(vec3(.02,.08,.55),vec3(.25,.45,1.),smoothstep(.9,0.,bd));
  blue+=smoothstep(.12,0.,abs(b.x+.35))*smoothstep(.9,.3,abs(b.y))*.35;
  blue=mix(blue,vec3(.2,.05,.08),smoothstep(.25,.1,length((b-vec2(-.15,.1))*vec2(2.6,1.1)))*.7);
  col=mix(col,blue,smoothstep(1.,.93,bd));
  vec2 c=(p-vec2(.25*k,-.1))/vec2(.14*k+.02,.25);
  float cd=length(c*vec2(1.,1.-.2*c.y));
  vec3 pink=mix(vec3(.55,.05,.2),vec3(1.,.55,.7),smoothstep(.95,.1,cd));
  pink+=smoothstep(.1,0.,abs(c.x+.3))*smoothstep(.9,.3,abs(c.y))*.3;
  col=mix(col,pink,smoothstep(1.,.93,cd));
  return col;
}
vec3 studio(vec2 q,vec2 uv,float t){
  vec3 col=mix(vec3(.86,.89,.93),vec3(.97,.98,.99),uv.y);
  float br=1.-abs(fbm(q*vec2(2.5,1.6)+vec2(t*.01,0.))*2.2);
  br=pow(clamp(br,0.,1.),9.);
  return mix(col,vec3(.55,.58,.6),br*.35);
}
vec3 photo(vec2 uv,float asp){
  vec2 p=uv-.5;
  if(asp>uImgAsp)p.y*=uImgAsp/asp;else p.x*=asp/uImgAsp;
  p+=.5;
  if(uMirror>.5)p.x=1.-p.x;
  return texture(uImg,vec2(p.x,1.-p.y)).rgb;
}
void main(){
  vec2 fr=gl_FragCoord.xy/uRes;
  vec2 uv=fr*(1.+2.*uMargin)-uMargin;
  vec2 scr=uRes/(1.+2.*uMargin);
  float asp=scr.x/scr.y,unit=min(scr.x,scr.y);
  vec2 s=uv*scr/unit;
  vec2 q=s+uPar;
  vec2 ls=uLight*scr/unit;
  float t=uTime;
  vec3 col;
  if(uScene==1)col=forest(q,uv,t);
  else if(uScene==2)col=city(q,uv,t);
  else if(uScene==3)col=sunset(q,uv,t);
  else if(uScene==4)col=vases(uv+uPar*.3,asp);
  else if(uScene==5)col=studio(q,uv,t);
  else if(uScene==6)col=photo(clamp(uv+uPar*.3,0.,1.),asp);
  else col=garden(q,uv,t,ls);
  if(uSunPow>.01){
    float dl=length(s-ls)/(.75+.25*uSunPow);
    float f=fbm(s*2.+vec2(3.1,1.7));
    float edge=smoothstep(1.05,0.,dl+.18*f)*min(uSunPow,1.);
    col=mix(col,uSunCol*(.88+.1*f),edge*.94);
    col+=uSunCol*exp(-dl*dl*4.)*.18*uSunPow;
  }
  o=vec4(col*uGrade*uExpo,1.);
}`;

/* ------------------------------------------------------------------ */
/* 2. Breath condensation                                              */
/* ------------------------------------------------------------------ */
export const FOG_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uPrev;uniform vec2 uRes;uniform float uAsp;
uniform vec4 uSeg;uniform float uBreath;uniform float uBreathR;uniform float uWipe;uniform float uFinger;
uniform float uDecay;uniform float uClear;uniform float uTime;
out vec4 o;
${NOISE}
float seg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-8),0.,1.);return length(pa-ba*h);}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  float f=texture(uPrev,uv).r*(1.-uClear);
  f=max(0.,f-uDecay*(.5+.7*(1.-f)));
  vec2 k=vec2(uAsp,1.);
  vec2 dp=(uv-uSeg.zw)*k;
  float n=.75+.5*gnoise(uv*k*9.+uTime*.3);
  float r=uBreathR*n;
  f+=uBreath*exp(-dot(dp,dp)/(r*r));
  float w=seg(uv*k,uSeg.xy*k,uSeg.zw*k);
  f*=1.-uWipe*(1.-smoothstep(uFinger*.7,uFinger*1.15,w));
  o=vec4(clamp(f,0.,1.),0.,0.,1.);
}`;

/* ------------------------------------------------------------------ */
/* 3. The pane                                                         */
/* ------------------------------------------------------------------ */
export const GLASS_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uBg;uniform sampler2D uFog;
uniform vec2 uRes;uniform float uDpr;uniform float uTime;
uniform vec2 uLight;uniform vec3 uGlintCol;uniform float uGlint;
uniform mat3 uRot;uniform float uTwist;uniform float uFocal;uniform float uDist;uniform float uThick;uniform float uMargin;
uniform int uTex;uniform int uMesh;uniform int uTint;
uniform float uScale;uniform float uRelief;uniform float uFrost;uniform float uDisp;uniform float uMeshOn;
uniform vec3 uPal[8];
uniform float uWireLit;uniform vec3 uEnvCol;uniform float uEnvWin;uniform float uEnvLamp;
uniform vec4 uCracks[6];uniform int uCrackN;
uniform vec4 uRipples[4];uniform int uRippleN;
out vec4 o;
${NOISE}
const float TAU=6.2831853;

/* ---------- lattices ---------- */
vec2 hexCell(vec2 p){vec2 r=vec2(1.,1.7320508),h=r*.5;vec2 a=mod(p,r)-h,b=mod(p-h,r)-h;return dot(a,a)<dot(b,b)?a:b;}
float hexDist(vec2 p){p=abs(p);return max(dot(p,normalize(vec2(1.,1.7320508))),p.x);}
// Voronoi with exact distance to the cell border (two passes)
vec2 voronoiB(vec2 x){
  vec2 n=floor(x),f=fract(x),mg=vec2(0.),mr=vec2(0.);float md=8.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 g=vec2(i,j);vec2 r=g+hash22(n+g)*.8+.1-f;float d=dot(r,r);
    if(d<md){md=d;mr=r;mg=g;}
  }
  md=8.;
  for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){
    vec2 g=mg+vec2(i,j);vec2 r=g+hash22(n+g)*.8+.1-f;
    if(dot(mr-r,mr-r)>1e-5)md=min(md,dot(.5*(mr+r),normalize(r-mr)));
  }
  return vec2(md,hash12(n+mg));
}

/* ---------- surface relief, heights in CSS px ---------- */
float hammered(vec2 l){
  vec2 w=l/10.;
  w+=.8*vec2(gnoise(w*.31+1.7),gnoise(w*.31+9.2));
  float r1=1.-abs(gnoise(w)*1.5),r2=1.-abs(gnoise(w*2.17+3.1)*1.5);
  return (r1*r1*1.6+r2*r2*.6+gnoise(w*.23)*1.5)*1.4;
}
float reeded(vec2 l){float f=fract(l.x/11.)*2.-1.;return sqrt(max(1.-f*f,0.))*4.+gnoise(l/34.)*.8;}
float flemish(vec2 l){
  vec2 x=l/30.+.35*vec2(gnoise(l/90.),gnoise(l/90.+5.2));
  vec2 n=floor(x),f=fract(x);float d1=8.,d2=8.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 g=vec2(i,j);float d=length(g+hash22(n+g)*.85+.075-f);
    if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;
  }
  float e=d2-d1;
  return sqrt(clamp(e*1.6,0.,1.))*5.+sin(e*34.)*.55*(1.-smoothstep(0.,.45,e))+gnoise(l/7.)*.4;
}
float rainH(vec2 l){
  vec2 w=vec2(l.x/6.,l.y/70.);
  w.x+=.7*gnoise(vec2(l.x/45.,l.y/120.));
  float r1=1.-abs(gnoise(w)*1.6),r2=1.-abs(gnoise(w*vec2(1.9,1.4)+4.)*1.6);
  float drops=smoothstep(.35,.7,gnoise(l/vec2(5.,9.)));
  return (r1*r1*r1*2.6+r2*r2+drops*1.2)*1.2;
}
float pebble(vec2 l){
  vec2 c=l/15.;vec2 i=floor(c),f=fract(c);float d=8.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y);d=min(d,length(g+hash22(i+g)*.8+.1-f));}
  return sqrt(max(.6-d*d,0.))*7.+gnoise(l/6.)*.5;
}
float roundel(vec2 l){
  float R=uScale*1.9;vec2 gv=hexCell(l/(2.*R));float d=length(gv)*2.;
  float dome=(1.-d*d)*2.;
  float rings=sin(d*26.+1.)*.6*(1.-d);
  float rim=smoothstep(.72,.9,d)*(1.-smoothstep(.9,.97,d))*4.;
  return (dome+rings+rim)*1.2;
}
float satin(vec2 l){return gnoise(l/2.6)*.45+gnoise(l/1.4+3.)*.25+gnoise(l/25.)*.8;}
float H(vec2 l){
  if(uTex==1)return reeded(l);
  if(uTex==2)return flemish(l);
  if(uTex==3)return rainH(l);
  if(uTex==4)return pebble(l);
  if(uTex==5)return roundel(l);
  if(uTex==6)return satin(l);
  return hammered(l);
}

/* ---------- wire, lead and cells ---------- */
struct St{float lead;float leadT;float leadD;float wire;float cell;float cells;};
float gridLines(vec2 p,float S,float hw){vec2 dl=(.5-abs(fract(p/S)-.5))*S;return max(1.-smoothstep(hw-.45,hw+.45,dl.x),1.-smoothstep(hw-.45,hw+.45,dl.y));}
St structure(vec2 l,vec2 lw,vec2 css){
  St s=St(0.,0.,1e3,0.,0.,0.);
  float S=uScale,hw=.7;
  if(uMesh>=1&&uMesh<=4){
    float w=0.;
    if(uMesh==1)w=gridLines(lw,S,hw);
    else if(uMesh==2){vec2 q=lw;q.x+=.13*S*sin(TAU*lw.y/S);w=gridLines(q,S,hw);}
    else if(uMesh==3){w=gridLines(mat2(.7071,.7071,-.7071,.7071)*lw,S*1.15,hw);}
    else{float k=S*1.25;vec2 gv=hexCell(lw/k*vec2(1.,1.15));float e=(.5-hexDist(gv))*k;w=1.-smoothstep(hw-.45,hw+.45,e);}
    s.wire=w*uMeshOn;
  }
  float W=0.,dpx=1e3;
  if(uMesh==5){
    float C=S*3.4;vec2 v=voronoiB(l/C);
    dpx=v.x*C;W=max(2.6,S*.16);s.cell=v.y;s.cells=1.;
  }else if(uMesh==6){
    float m=min(css.x,css.y);
    vec2 v=l-vec2(-.5*css.x+.04*m,-.5*css.y+.02*m);
    float r=length(v),ang=atan(v.y,v.x),R0=.36*m,sw=1.5707963/7.;
    float fr=fract(ang/sw),dRay=r*sin(min(fr,1.-fr)*sw),dArc=abs(r-R0);
    dpx=r<R0?dArc:min(dRay,dArc);W=max(2.8,S*.17);
    s.cell=r<R0?7.5/8.:(clamp(floor(ang/sw),0.,6.)+.5)/8.;s.cells=1.;
  }
  if(W>0.){
    s.lead=(1.-smoothstep(W-.8,W+.8,dpx))*uMeshOn;s.leadT=clamp(dpx/W,0.,1.);s.leadD=max(dpx-W,0.);
  }
  if(uTex==5){
    float R=S*1.9;vec2 p=l/(2.*R);vec2 gv=hexCell(p);float d=length(gv)*2.;
    s.lead=max(s.lead,smoothstep(.955,.985,d));s.leadT=max(s.leadT,.55);
    s.leadD=min(s.leadD,max(.955-d,0.)*R);
    s.cell=hash12(floor((p-gv)*4.+.5));s.cells=1.;
  }
  return s;
}

/* ---------- impacts ---------- */
// x: crack line mask, yz: tilt of the shard under this pixel
vec3 cracks(vec2 l){
  vec3 acc=vec3(0.);
  for(int i=0;i<6;i++){
    if(i>=uCrackN)break;
    vec4 c=uCracks[i];vec2 v=l-c.xy;float r=length(v);
    float R=260.;if(r>R)continue;
    float grow=clamp(c.z*3.5,0.,1.),seed=c.w,N=11.;
    float aw=atan(v.y,v.x)+.18*gnoise(vec2(r/55.,seed*13.))+.06*gnoise(vec2(r/14.,seed*7.));
    float sx=aw/TAU*N+seed*3.,sec=floor(sx),fr=fract(sx);
    float dRad=r*sin(min(min(fr,1.-fr)*TAU/N,1.2));
    float bIdx=mod(fr<.5?sec:sec+1.,N);
    float len=R*(.35+.65*hash12(vec2(bIdx,seed)));
    float radial=(1.-smoothstep(.35,1.3,dRad))*step(r,len*grow)*smoothstep(len,len*.7,r);
    float lr=log2(max(r,1.)/12.)*1.35,ri=floor(lr),rf=fract(lr);
    float dRing=min(rf,1.-rf)*r*.513;
    float ringIdx=rf<.5?ri:ri+1.;
    float ringOn=step(.45,hash12(vec2(mod(sec,N)*7.+ringIdx,seed+3.)))*step(r,R*.75*grow)*step(1.,ringIdx);
    float ring=(1.-smoothstep(.3,1.1,dRing))*ringOn;
    float crush=(1.-smoothstep(5.,13.,r))*step(.05,grow);
    acc.x=max(acc.x,max(max(radial,ring),crush));
    acc.yz+=(hash22(vec2(mod(sec,N),ri+seed*5.))-.5)*.22*(1.-r/R)*step(r,R*.8*grow);
  }
  return acc;
}

/* ---------- optics ---------- */
vec2 refrUV(vec3 d,vec3 n,vec3 N,vec3 hit,float ior,vec2 css){
  vec3 r=refract(d,n,1./ior);
  vec3 p2=hit+r*(uThick/max(-dot(r,N),.2));
  vec3 r2=refract(r,N,ior);
  if(dot(r2,r2)<.5)r2=r;
  vec3 pb=p2+r2*(uDist/max(-r2.z,.05));
  vec2 uv=pb.xy*uFocal/(uFocal-pb.z)/css+.5;
  return (uv+uMargin)/(1.+2.*uMargin);
}
// The room behind the viewer, seen in reflection: a window with mullions and a lamp
vec3 envLight(vec3 r){
  vec2 q=r.xy/max(r.z,.08);
  vec3 e=uEnvCol*.1*(.6+.4*clamp(r.y*.5+.5,0.,1.));
  vec2 wq=(q-vec2(-.14,.16))/vec2(.2,.27);
  float win=smoothstep(1.,.85,abs(wq.x))*smoothstep(1.,.85,abs(wq.y));
  win*=1.-.85*clamp(smoothstep(.035,.015,abs(wq.x))+smoothstep(.035,.015,abs(wq.y)),0.,1.);
  e+=uEnvCol*win*5.*uEnvWin;
  vec2 lq=q-vec2(.24,.1);
  e+=uEnvCol*(exp(-dot(lq,lq)*90.)*14.+exp(-dot(lq,lq)*6.)*.6)*uEnvLamp;
  return e;
}

void main(){
  vec2 css=uRes/uDpr;float unit=min(css.x,css.y);
  vec2 fc=gl_FragCoord.xy;
  vec2 sp=fc/uDpr-css*.5;
  vec3 cam=vec3(0.,0.,uFocal);
  vec3 d=normalize(vec3(sp,-uFocal));

  // ray to the rotated pane, then into its own flat coordinates
  vec3 X0=uRot[0],Y0=uRot[1],N0=uRot[2];
  vec3 hit=cam+d*(-dot(N0,cam)/min(dot(N0,d),-1e-3));

  // twist: each row of the pane turns a little more the higher it sits
  float tw=uTwist*(dot(hit,Y0)/css.y);
  vec3 N=normalize(N0*cos(tw)+X0*sin(tw));
  vec3 X=normalize(X0*cos(tw)-N0*sin(tw));
  vec3 Y=Y0;
  hit=cam+d*(-dot(N,cam)/min(dot(N,d),-1e-3));
  vec2 l=vec2(dot(hit,X),dot(hit,Y));

  float e=.8;
  float h0=H(l);
  vec2 g=clamp(vec2(H(l+vec2(e,0.))-h0,H(l+vec2(0.,e))-h0)/e*uRelief,-2.5,2.5);

  for(int i=0;i<4;i++){
    if(i>=uRippleN)break;
    vec4 rp=uRipples[i];vec2 v=l-rp.xy;float r=length(v)+1e-3;
    float front=rp.z*420.;
    float env=exp(-rp.z*2.6)*rp.w*exp(-pow((r-front)/60.,2.));
    g+=v/r*cos((r-front)*.09)*.95*env;
  }
  vec3 ck=cracks(l);
  g+=ck.yz;

  St st=structure(l,l+g*.6,css);
  if(st.cells>.5)g+=(hash22(vec2(st.cell*97.3,4.1))-.5)*.16;

  vec3 n=normalize(N-X*g.x-Y*g.y);

  vec2 fuv=l/css+.5;
  float fog=texture(uFog,fuv).r*step(0.,fuv.x)*step(fuv.x,1.)*step(0.,fuv.y)*step(fuv.y,1.);

  // dispersion grows as the pane turns away from you
  float cosM=clamp(dot(N,-d),.2,1.);
  float spread=.012*uDisp*(1.+10.*(1.-cosM));
  vec2 uvG=refrUV(d,n,N,hit,1.5,css);
  vec2 uvR=refrUV(d,n,N,hit,1.5-spread,css);
  vec2 uvB=refrUV(d,n,N,hit,1.5+spread,css);
  float lod=1.2+uFrost+fog*4.;
  vec3 col=vec3(textureLod(uBg,uvR,lod).r,textureLod(uBg,uvG,lod).g,textureLod(uBg,uvB,lod).b);
  col=mix(col,textureLod(uBg,uvG,lod+2.5).rgb,.22);
  float lum=dot(col,vec3(.3,.59,.11));

  // body colour of the glass
  vec3 iri=vec3(1.);
  if(uTint==0){col*=vec3(.95,1.,.96);}
  else if(uTint==2){
    float cosT=clamp(abs(dot(n,-d)),0.,1.);
    float film=1.+.35*h0/5.+.5*gnoise(l/260.+vec2(uTime*.02,0.))+.25*gnoise(l/60.);
    iri=.5+.5*cos(TAU*(film*6.*cosT+vec3(0.,.33,.67)));
    col=col*(.6+.75*iri)+iri*.1*(.4+lum);
  }else{
    vec3 tc;float tk;
    if(uTint==1){
      float cell=st.cell;
      if(st.cells<.5)cell=voronoiB(l/(uScale*3.4)).y;
      tc=uPal[min(int(cell*8.),7)]*(.82+.3*gnoise(l/vec2(140.,26.)+cell*13.)+.12*gnoise(l/9.));
      tk=.92;
    }else if(uTint==3){tc=vec3(1.,.62,.2);tk=.85;}
    else if(uTint==4){tc=vec3(.3,.78,.36);tk=.85;}
    else{tc=vec3(.55,.63,.74);tk=.75;}
    if(uTint==5)col=mix(col,tc*(lum*1.55+.03),.92);
    else col=mix(col,mix(col*tc*1.2,tc*(lum*1.45+.02),.55),tk);
  }

  // wire sits inside the glass
  vec2 lp=(uLight-.5)*css;vec2 dv=lp-sp;float dist=length(dv);
  float near=exp(-dist/(.6*unit));
  float wl=dot(col,vec3(.3,.59,.11));
  vec3 wc=vec3(.05,.055,.055)+vec3(.6,.62,.6)*uWireLit*(.75+.5*near);
  col=mix(col,wc,st.wire*.88*(1.-.85*smoothstep(.55,.95,wl)*uWireLit));

  // surface light: glints, shading, reflection of the room
  vec3 L=normalize(vec3(dv,.55*unit));
  float ndh=max(dot(n,normalize(L+vec3(0.,0.,1.))),0.);
  col+=uGlintCol*(pow(ndh,140.)*2.2+pow(ndh,18.)*.12)*near*uGlint*(1.-fog*.8);
  col+=uGlintCol*.12*uGlint*exp(-pow(dist/(.45*unit),2.));
  float lum0=dot(col,vec3(.3,.59,.11));
  col*=1.+dot(n.xy,normalize(dv+1e-4))*.75*smoothstep(.25,.85,lum0);
  vec3 rv=reflect(d,n);
  float F=.04+.96*pow(1.-clamp(dot(n,-d),0.,1.),5.);
  col+=envLight(rv)*F*(uTint==2?(.6+.8*iri):vec3(1.));

  // cracks catch the light along their broken edges
  vec3 crackC=mix(vec3(.93,.96,.95)*(.55+.5*lum+.25*uWireLit),vec3(.1,.12,.12)+.2*uGlintCol*near,smoothstep(.5,.9,lum));
  col=mix(col,crackC,ck.x*.85);

  // lead came sits on the surface
  if(uMesh>=5||uTex==5){
    col*=1.-.3*(1.-smoothstep(0.,5.,st.leadD));
    float tl=st.leadT;
    vec3 lc=vec3(.045,.05,.055)+vec3(.5,.52,.55)*uWireLit*(.28*(1.-tl*tl)+.7*pow(1.-tl,6.)*(.4+.6*near))+uEnvCol*.03;
    col=mix(col,lc,st.lead);
  }

  // breath on the glass
  float flum=dot(textureLod(uBg,uvG,5.).rgb,vec3(.3,.59,.11));
  vec3 fogC=mix(vec3(.62,.66,.66),vec3(.95,.97,.96),flum)+uGlintCol*near*.12*uGlint;
  col=mix(col,fogC,clamp(fog*.85,0.,.88));
  col+=smoothstep(.55,.85,gnoise(l/3.1))*smoothstep(.2,.6,fog)*fog*.18*(.4+flum);

  vec2 uv=fc/uRes;
  col*=.78+.22*smoothstep(1.25,.35,length((uv-.5)*vec2(1.,.9)));
  col+=(hash12(fc+fract(uTime)*731.)-.5)*.03;
  o=vec4(clamp(col,0.,1.),1.);
}`;
