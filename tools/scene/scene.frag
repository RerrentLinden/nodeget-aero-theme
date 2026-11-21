#version 300 es
// 「被许诺的未来」—— 主题背景的场景。一张图由这个片元着色器按几何和光算出来（光线步进），
// 没有贴图、没有模型。配色是 Frutiger Aero 那一套：天从 #1e8fe6 到 #eefaff，材质只有蓝、绿、白。
precision highp float;
precision highp int;
uniform vec2 uRes, uJit;
uniform float uSeed, uNight, uMode;        // uMode：0 完整成片；1 底图（不画肥皂泡和风车，它们由页面实时画）；2 遮罩（红=水面，绿=天空）
out vec4 O;

#define C(h) pow(vec3(float((h>>16)&255),float((h>>8)&255),float(h&255))/255.,vec3(2.2))
const float KX = .373, FV = 2.68, YS = -0.12;    // 柱面投影：横向每单位 .373 弧度；地平线在画面 44% 处，竖线保持竖直
const vec3 CAM = vec3(0., 1.9, 0.);
const vec3 SUN = normalize(vec3(.4807, .2164, .8498));   // 太阳在右侧那座城的上方
vec3 SUNC, AMB;
float gMat;

// ---------- 噪声 ----------
float h12(vec2 p){ vec3 q = fract(vec3(p.xyx)*.1031); q += dot(q, q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float h13(vec3 p){ p = fract(p*.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vn2(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(h12(i), h12(i+vec2(1,0)), f.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), f.x), f.y); }
float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(h13(i), h13(i+vec3(1,0,0)), f.x), mix(h13(i+vec3(0,1,0)), h13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i+vec3(0,0,1)), h13(i+vec3(1,0,1)), f.x), mix(h13(i+vec3(0,1,1)), h13(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm2(vec2 p){ float a = .5, s = 0.; for(int i = 0; i < 5; i++){ s += a*vn2(p); p = p*2.02+vec2(11.3, 5.1); a *= .5; } return s; }
float fbm3(vec3 p, int oct){ float a = .5, s = 0.; for(int i = 0; i < 6; i++){ if(i >= oct) break; s += a*vn3(p); p = p*2.03+vec3(17.1, 3.7, 9.2); a *= .5; } return s; }

// ---------- 距离场 ----------
float sdEll(vec3 p, vec3 r){ float k0 = length(p/r); if(k0 < 1e-4) return -min(r.x, min(r.y, r.z)); return k0*(k0-1.)/length(p/(r*r)); }
float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p-a, ba = b-a; return length(pa-ba*clamp(dot(pa, ba)/dot(ba, ba), 0., 1.))-r; }
float sdCyl(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y))-vec2(r, h); return min(max(d.x, d.y), 0.)+length(max(d, 0.)); }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p)-b; return length(max(q, 0.))+min(max(q.x, max(q.y, q.z)), 0.); }
float smin(float a, float b, float k){ float h = clamp(.5+.5*(b-a)/k, 0., 1.); return mix(b, a, h)-k*h*(1.-h); }
float sdTower(vec3 p, float x, float z, float r, float h){ return sdCap(p, vec3(x, 0., z), vec3(x, h-r, z), r); }
vec2 isph(vec3 ro, vec3 rd, vec3 c, float r){ vec3 oc = ro-c; float b = dot(oc, rd), h = b*b-dot(oc, oc)+r*r; if(h < 0.) return vec2(-1.); h = sqrt(h); return vec2(-b-h, -b+h); }

// ---------- 场景里的东西 ----------
const vec2 AX = vec2(.4771, .8788), PX = vec2(.8788, -.4771);    // 右侧主体的轴线（从镜头出发朝右 28.5°，落在画面 87.5% 处）和它的垂线
const vec3 OC = vec3(-41., 4.6, 75.6); const float OR = 7.;     // 左侧：罩着小岛的玻璃球
const vec3 FP = vec3(11.71, .23, 20.95);                          // 右侧：人站在最后一块石阶上，前面是开阔的水
const float SX[6] = float[6](2.39, 4.59, 5.7, 8.18, 9.42, 11.71);
const float SZ[6] = float[6](4.39, 7.52, 11.24, 14.22, 17.87, 20.95);
const vec3 HC[2] = vec3[2](vec3(-118., -6., 200.), vec3(-40., -5., 270.));
const vec3 HR[2] = vec3[2](vec3(70., 25., 50.), vec3(60., 14., 48.));
const vec4 TR[5] = vec4[5](vec4(-150., 186., 0., 5.2), vec4(-102., 176., 0., 4.4), vec4(-80., 214., 0., 4.8), vec4(-52., 250., 1., 3.8), vec4(-22., 262., 1., 3.4));
const vec4 TB[6] = vec4[6](vec4(-135., 205., 17., 34.), vec4(-88., 188., 15., 26.), vec4(-95., 560., -1., 62.), vec4(-30., 585., -1., 62.), vec4(40., 570., -1., 62.), vec4(110., 600., -1., 62.));
const vec4 BB[9] = vec4[9](vec4(-1.49, 2.45, 2.55, .2), vec4(-2.41, 3.5, 5.26, .15), vec4(-2.21, 1.07, 3.47, .17), vec4(1.33, 2.23, 2.89, .2), vec4(2.73, 1.96, 4.19, .16),
  vec4(3.4, 3.81, 5.81, .2), vec4(-1.3, 3.7, 7.68, .2), vec4(1.08, 4.53, 9.59, .17), vec4(2.72, 3.8, 11.53, .22));
vec3 cityL(vec3 p){ vec2 d = p.xz-AX*740.; return vec3(dot(d, PX), p.y, dot(d, AX)); }            // 玻璃城自己的坐标：x 朝画面右，z 朝远
vec3 figL(vec3 p){ vec3 d = p-FP; return vec3(dot(d.xz, PX), d.y, dot(d.xz, AX)); }
float hillY(int i, vec2 xz){ vec2 q = (xz-HC[i].xz)/HR[i].xz; return HC[i].y+HR[i].y*sqrt(max(1.-dot(q, q), 0.)); }

#define U(dd, mm) { float d_ = dd; if(d_ < d){ d = d_; gMat = mm; } }
float map(vec3 p){
  float d = 1e9; gMat = 0.;
  if(p.z < 30.){
    for(int i = 0; i < 6; i++) U(sdCyl(p-vec3(SX[i], .1, SZ[i]), 1.12, .1)-.03, 4.)
    vec3 q = figL(p);
    if(dot(q, q) < 6.){
      float f = min(sdCap(q, vec3(-.09, .07, 0.), vec3(-.085, .86, 0.), .068), sdCap(q, vec3(.09, .07, 0.), vec3(.085, .86, 0.), .068));
      f = min(f, min(sdEll(q-vec3(-.09, .035, -.03), vec3(.05, .04, .11)), sdEll(q-vec3(.09, .035, -.03), vec3(.05, .04, .11))));
      float to = sdEll(q-vec3(0., 1.2, 0.), vec3(.19, .36, .115));
      to = smin(to, sdCap(q, vec3(-.16, 1.43, 0.), vec3(.16, 1.43, 0.), .07), .06);
      to = smin(to, sdEll(q-vec3(0., .92, 0.), vec3(.175, .1, .11)), .05);
      f = min(f, to);
      f = min(f, min(sdCap(q, vec3(-.245, 1.41, 0.), vec3(-.27, .9, .03), .045), sdCap(q, vec3(.245, 1.41, 0.), vec3(.27, .9, .03), .045)));
      f = min(f, sdCap(q, vec3(0., 1.5, 0.), vec3(0., 1.57, 0.), .042));
      f = min(f, sdEll(q-vec3(0., 1.655, 0.), vec3(.09, .108, .098)));
      U(f, 6.)
    } else U(length(q)-1.9, 0.)
  }
  { vec3 q = p-OC; float dq = length(q);
    if(dq < OR+2.){
      U(sdEll(q-vec3(0., -4.4, 0.), vec3(5.1, 2.2, 5.1)), 1.)
      U(sdCap(q, vec3(-1., -2.3, .3), vec3(-1., .1, .3), .18), 3.)
      vec3 c = q-vec3(-1., 1.15, .3);
      U(length(c)-1.75*(1.+.16*(fbm3(c*1.9, 3)-.5)), 2.)
      U(length(q-vec3(2., -2.3, -.5))-.95, 4.)
    } else U(dq-OR-.5, 0.)
  }
  if(p.z > 110.){
    for(int i = 0; i < 2; i++) U(sdEll(p-HC[i], HR[i]), 1.)
    if(p.z < 320.) for(int i = 0; i < 5; i++){
      vec4 T = TR[i]; float r = T.w; vec3 b = vec3(T.x, hillY(int(T.z), T.xy)-.3, T.y), c = p-(b+vec3(0., r*2.3, 0.));
      float dc = length(c), dt = sdCap(p, b, b+vec3(0., r*1.6, 0.), r*.1);
      if(dc < r*1.6){ U(dc-r*(1.+.2*(fbm3(c*2.2/r+float(i)*7., 3)-.5)), 2.) U(dt, 3.) }
      else U(min(dc-r*1.3, dt), 3.)
    }
    if(uMode < .5) for(int i = 0; i < 6; i++){                      // 风力发电机：两台在左边的丘上，四台立在远处的水里
      vec4 T = TB[i]; float H = T.w; vec3 b = vec3(T.x, T.z, T.y), hub = b+vec3(0., H, 0.), hp = hub+vec3(0., 0., -2.4);
      if(length(p.xz-b.xz) > H){ U(length(p.xz-b.xz)-H*.6, 0.) continue; }
      float f = min(sdCap(p, b, hub, H*.02), sdCap(p, hub+vec3(0., 0., 3.), hub+vec3(0., 0., -2.2), H*.032)), ph = float(i)*1.3+.4;
      for(int k = 0; k < 3; k++){ float a = ph+float(k)*2.0944; f = min(f, sdCap(p, hp, hp+vec3(cos(a), sin(a), 0.)*H*.48, H*.013)); }
      U(f, 4.)
    }
  } else U(145.-p.z, 0.)
  if(p.z > 250.){                                                   // 单轨：从左边的丘后面出来，横过水面，进城
    vec2 d2 = p.xz-vec2(-200., 330.); float a = dot(d2, vec2(.8235, .5673)), b = dot(d2, vec2(-.5673, .8235));
    vec3 q = vec3(a-273.2, p.y-13.4, b);
    U(min(sdBox(q, vec3(273.2, .55, 1.5)), max(sdCyl(vec3(mod(a+22.5, 45.)-22.5, p.y-6.5, b), 1., 6.6), abs(q.x)-273.2)), 4.)
    U(sdCap(vec3(a, p.y, b), vec3(300., 15.9, 0.), vec3(344., 15.9, 0.), 1.8), 8.)
  } else U(326.-p.z, 0.)
  { vec3 q = cityL(p); float dc = length(q.xz);                      // 玻璃城，和它脚下的岸
    if(dc < 380.){
      U(sdEll(q-vec3(0., -3., 60.), vec3(330., 10., 60.)), 1.)
      if(dc < 240.){
        float c = sdTower(q, -78., -30., 13., 120.);
        c = min(c, sdTower(q, -48., 10., 16., 205.));
        c = min(c, sdEll(q-vec3(-12., 78., -40.), vec3(20., 96., 20.)));
        c = min(c, sdTower(q, 22., 20., 12., 150.)); c = min(c, sdTower(q, 50., 20., 12., 178.));
        c = min(c, sdBox(q-vec3(36., 112., 20.), vec3(9., 3.5, 5.)));
        c = min(c, sdTower(q, 84., 50., 18., 132.)); c = min(c, sdTower(q, -110., 40., 14., 96.)); c = min(c, sdTower(q, 112., 30., 13., 110.));
        U(c, 5.)
        U(length(q-vec3(-96., 0., -60.))-40., 7.)
        U(min(sdCap(q, vec3(8., 0., -60.), vec3(8., 250., -60.), 2.), sdEll(q-vec3(8., 205., -60.), vec3(17., 5., 17.))), 4.)
      } else U(dc-200., 0.)
    } else U(dc-340., 0.)
  }
  return d;
}
float march(vec3 ro, vec3 rd, float tmin, float tmax, int steps){
  float t = tmin;
  for(int i = 0; i < 220; i++){ if(i >= steps) break; float d = map(ro+rd*t); if(d < .0007*t+.0005) return t; t += d*.86; if(t > tmax) break; }
  return -1.;
}
vec3 nrm(vec3 p, float t){ vec2 e = vec2(max(.0015*t, .002), 0.); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
float shadow(vec3 ro, vec3 rd, float mint, float maxt){
  float res = 1., t = mint;
  for(int i = 0; i < 44; i++){ float h = map(ro+rd*t); res = min(res, 9.*h/t); t += clamp(h, .04, 14.); if(res < .004 || t > maxt) break; }
  return clamp(res, 0., 1.);
}

// ---------- 天、极光、云 ----------
vec3 sky(vec3 rd){
  float h = max(rd.y, 0.), n = uNight;
  vec3 c = mix(mix(C(0xeefaff), C(0x2a7fc4)*.8, n), mix(C(0xbfe6fa), C(0x0d4a94), n), smoothstep(0., .05, h));
  c = mix(c, mix(C(0x58b8f2), C(0x07265e), n), smoothstep(.03, .16, h));
  c = mix(c, mix(C(0x1e8fe6), C(0x03112e), n), smoothstep(.12, .42, h));
  float sd = max(dot(rd, SUN), 0.);
  c += SUNC*(pow(sd, 6.)*.06+pow(sd, 40.)*.11+pow(sd, 400.)*.4+pow(sd, 5000.)*30.);
  float az = atan(rd.x, rd.z);
  float b1 = h-(.2+.03*sin(az*3.+1.)+.016*sin(az*7.3)), b2 = h-(.3+.03*sin(az*2.3+2.)+.02*sin(az*5.1));
  float au = smoothstep(0., .01, b1)*exp(-b1*10.)+.7*smoothstep(0., .014, b2)*exp(-b2*7.);
  c += mix(C(0x7dffb0), C(0x4ad0ff), .5+.5*sin(az*2.+h*9.))*au*(.6+.4*vn2(vec2(az*46., h*4.)))*mix(.09, 1., n);
  if(n > 0.){ vec3 g = floor(rd*340.); float s = h13(g); c += n*smoothstep(.9972, 1., s)*(.5+.5*h13(g+7.))*1.6*smoothstep(0., .1, h); }
  return c;
}
float cdens(vec3 p, int oct){
  float hg = (p.y-900.)/1000., prof = smoothstep(0., .12, hg)*smoothstep(1., .3, hg);
  float base = smoothstep(.54, .72, fbm2(p.xz*.00042+vec2(3.1, 1.7)))*prof;
  if(base <= 0.) return 0.;
  return clamp(base*1.6-fbm3(p*.003, oct)*.8*(1.-base*.35), 0., 1.);
}
vec4 clouds(vec3 ro, vec3 rd, float jit, int lq){
  if(rd.y < .014) return vec4(0., 0., 0., 1.);
  float t0 = (900.-ro.y)/rd.y, t1 = min((1900.-ro.y)/rd.y, 30000.);
  if(t0 >= t1) return vec4(0., 0., 0., 1.);
  int N = lq > 0 ? 14 : 40; float dt = (t1-t0)/float(N), t = t0+dt*jit, T = 1., sd = max(dot(rd, SUN), 0.); vec3 col = vec3(0.);
  vec3 lit = mix(vec3(1.), vec3(.5, .62, .85), uNight), dark = mix(vec3(.56, .71, .9), vec3(.06, .1, .22), uNight);
  for(int i = 0; i < 40; i++){
    if(i >= N) break;
    vec3 p = ro+rd*t; float d = cdens(p, lq > 0 ? 3 : 5);
    if(d > .01){
      float ld = 0.; for(int j = 1; j <= 3; j++) ld += cdens(p+SUN*float(j)*150., 3);
      float sunT = exp(-ld*2.1), hg = clamp((p.y-900.)/1000., 0., 1.);
      vec3 c = mix(dark*(.8+.3*hg), lit, sunT*(1.-uNight*.7))+SUNC*.14*sunT*pow(sd, 5.);
      c = mix(c, sky(normalize(vec3(rd.x, .02, rd.z))), 1.-exp(-t*.000055));
      float a = 1.-exp(-d*dt*.011);
      col += T*a*c; T *= 1.-a; if(T < .02) break;
    }
    t += dt;
  }
  return vec4(col, T);
}
vec3 skyAll(vec3 ro, vec3 rd, float jit, int lq){ vec3 c = sky(rd); vec4 cl = clouds(ro, rd, jit, lq); return c*cl.a+cl.rgb; }
vec3 fog(vec3 col, float t, vec3 rd){ return mix(col, sky(normalize(vec3(rd.x, .012, rd.z)))*.97, 1.-exp(-t*.00066)); }

// ---------- 材质 ----------
vec3 shadeSolid(vec3 p, vec3 rd, float t, bool hq){
  float m = gMat; vec3 n = nrm(p, t);
  float sh = t < 560. ? shadow(p+n*(.02+.002*t), SUN, .06+.004*t, 280.) : 1.;
  float ndl = max(dot(n, SUN), 0.), skyv = .5+.5*n.y, ao = 1., spec = 0., gloss = 40.;
  if(hq && t < 160.){ float s = 0.; for(int i = 1; i <= 4; i++){ float h = .12*float(i)*(1.+t*.03); s += (h-map(p+n*h))/float(i); } ao = clamp(1.-.55*s, 0., 1.); }
  vec3 alb, emis = vec3(0.);
  if(m < 1.5){                                             // 修剪过的草
    float big = fbm2(p.xz*.045+3.), sm = vn2(p.xz*2.6);
    alb = mix(C(0x56b03c), C(0xa8e04a), .3+.55*big);
    alb = mix(alb, C(0xdcee6e), smoothstep(.6, .78, big)*.5);
    alb *= .86+.28*sm; alb *= .92+.09*smoothstep(.4, .6, abs(fract((p.x*.6+p.z*.8)/7.)-.5)*2.); alb *= .8+.2*smoothstep(0., 2.5, p.y); spec = .04;
  } else if(m < 2.5){ alb = mix(C(0x2c8a2c), C(0x86d44c), .2+.65*fbm3(p*1.2, 3)); }   // 球形树冠
  else if(m < 3.5){ alb = C(0x7a6654); }
  else if(m < 4.5){ alb = vec3(.84, .87, .9); spec = .3; gloss = 70.; }           // 白：石阶、风车、塔
  else if(m > 7.5){ alb = abs(p.y-16.1) < .5 ? C(0x1c4f9c) : vec3(.9, .92, .95); spec = .5; gloss = 90.; }                      // 单轨列车
  else if(m < 5.5 || m > 6.5){                                                     // 玻璃楼和穹顶
    vec3 r = reflect(rd, n), ev = sky(normalize(vec3(r.x, abs(r.y)*.7+.06, r.z)));
    vec3 g = mix(C(0x2a78c8)*.55, ev, .72)*vec3(.8, .92, 1.);
    float line;
    if(m < 5.5){ float fl = fract(p.y/3.6); line = smoothstep(.16, .1, fl); }
    else { vec3 q = cityL(p)-vec3(-96., 0., -60.); float la = asin(clamp(q.y/40., -1., 1.)), lo = atan(q.x, q.z); line = max(smoothstep(.9, .96, fract(lo*7.64)), smoothstep(.9, .96, fract(la*9.))); }
    vec3 col = mix(g, vec3(.95, .97, 1.)*(.55+.45*ndl+.2*skyv), line*.8);
    col += SUNC*pow(max(dot(r, SUN), 0.), 14.)*.5+ev*pow(1.-max(dot(n, -rd), 0.), 3.)*.5;
    if(uNight > 0.){ vec2 id = vec2(floor(p.y/3.6), floor(atan(n.x, n.z)*7.)); col = col*.5+vec3(1., .88, .66)*step(.87, h12(id+floor(p.xz*.02)))*(1.-line)*.95; }
    return col;
  } else {                                                                          // 人：背影，浅绿厂服
    vec3 q = figL(p);
    alb = q.y < .07 ? vec3(.82) : q.y < .9 ? C(0x27365e) : C(0xcfe8c6);
    if(abs(q.x) > .2 && q.y < 1.17 && q.y > .8) alb = C(0xe2bd9c);
    if(q.y > 1.5) alb = q.y > 1.59 ? C(0x15161c) : C(0xe2bd9c);
    spec = .05;
  }
  vec3 col = alb*(SUNC*ndl*sh+AMB*skyv*ao+AMB*vec3(.5, .62, .5)*(1.-skyv)*.5);
  col += SUNC*spec*pow(max(dot(reflect(rd, n), SUN), 0.), gloss)*sh;
  if(m < 1.5) col += sky(vec3(n.x, abs(n.y), n.z))*pow(1.-max(dot(n, -rd), 0.), 4.)*.1;
  if(m > 3.5 && m < 4.5 && t < 80.){ vec3 r = reflect(rd, n); col += sky(normalize(vec3(r.x, abs(r.y)+.03, r.z)))*(.04+.5*pow(1.-max(dot(n, -rd), 0.), 4.)); col *= .93+.1*vn2(p.xz*9.); }
  if(m > 1.5 && m < 2.5) col += SUNC*alb*pow(max(dot(rd, SUN), 0.), 3.)*.3*(.4+.6*sh);
  col += mix(alb, vec3(dot(alb, vec3(.33))), .55)*vec3(.85, 1., .9)*uNight*.9*smoothstep(OR+1., 2., length(p-OC));
  return col+emis;
}

// ---------- 玻璃球和肥皂泡：很薄的膜，只叠反光 ----------
vec3 envCheap(vec3 d){ return d.y >= 0. ? sky(d) : mix(C(0x1f9be6)*.7, sky(vec3(d.x, -d.y, d.z)), .55); }
void shellOne(vec3 ro, vec3 rd, float tmax, vec3 c, float R, float film, inout vec3 col){
  vec2 h = isph(ro, rd, c, R); if(h.x <= 0. || h.x > tmax) return;
  vec3 n = normalize(ro+rd*h.x-c), r1 = reflect(rd, n), tint = vec3(1.);
  float cs = max(dot(n, -rd), 0.), fr = pow(1.-cs, 2.6);
  if(film > 0.) tint = mix(vec3(1.), .55+.45*cos(6.2831*((1.-cs)*2.6+n.y*1.4+vec3(0., .33, .67))), .6);
  col *= mix(vec3(.985, .995, 1.), vec3(.86, .94, .98), fr);
  col += envCheap(r1)*tint*(.04+.95*fr)+SUNC*pow(max(dot(r1, SUN), 0.), 900.)*10.;
  col += mix(vec3(1.), vec3(.6, .95, .9), uNight)*pow(max(dot(r1, normalize(vec3(-.55, .62, -.56))), 0.), 26.)*mix(.5, .22, uNight);
  if(h.y < tmax){
    vec3 n2 = normalize(ro+rd*h.y-c), r2 = reflect(rd, -n2);
    col += envCheap(r2)*tint*(.02+.35*pow(1.-max(dot(n2, rd), 0.), 3.))*.6+SUNC*pow(max(dot(r2, SUN), 0.), 900.)*4.;
  }
}
void shells(vec3 ro, vec3 rd, float tmax, inout vec3 col){
  shellOne(ro, rd, tmax, OC, OR, 0., col);
  if(uMode < .5) for(int i = 0; i < 9; i++) shellOne(ro, rd, tmax, BB[i].xyz, BB[i].w, 1., col);
}

// ---------- 水：近处是被波浪推动的镜子，远处把倒影上下抹开 ----------
vec3 env(vec3 ro, vec3 rd, float jit){
  float t = march(ro, rd, .2, 1300., 90), th = 1e6; vec3 col;
  if(t > 0.){ col = fog(shadeSolid(ro+rd*t, rd, t, false), t, rd); th = t; } else col = skyAll(ro, rd, jit, 1);
  shells(ro, rd, th, col);
  return col;
}
float wh(vec2 p){ return fbm2(p*.6)*.22+vn2(p*2.3+11.)*.05+vn2(p*6.+3.)*.012; }
vec3 water(vec3 p, vec3 rd, float t, vec2 rnd){
  float a = 1./(1.+t*.03), e = .06, h0 = wh(p.xz), far = smoothstep(15., 300., t);
  vec3 n = normalize(vec3(-(wh(p.xz+vec2(e, 0.))-h0)/e*a, 1., -(wh(p.xz+vec2(0., e))-h0)/e*a));
  n = normalize(n+vec3((rnd.x-.5)*.012, 0., (rnd.y-.5)*.09)*far);
  vec3 r = reflect(rd, n); r.y = abs(r.y)+.002; r = normalize(r);
  float fr = .02+.98*pow(1.-max(dot(n, -rd), 0.), 5.);
  vec3 body = mix(C(0x2fb6ee), C(0x0b7fd0), smoothstep(0., 90., t))*(.5+.5*max(dot(n, SUN), 0.)*2.)*mix(1., .12, uNight);
  vec3 col = mix(body, env(p+vec3(0., .02, 0.), r, rnd.x), fr);
  col += SUNC*min(pow(max(dot(r, SUN), 0.), 1400.)*60., 6.);
  float ring = smoothstep(.3, 0., abs(length(p.xz-OC.xz)-5.28));
  for(int i = 0; i < 6; i++) ring = max(ring, .5*smoothstep(.12, 0., abs(length(p.xz-vec2(SX[i], SZ[i]))-1.16)));
  return mix(col, vec3(.95, .98, 1.)*(1.-uNight*.7), ring*.7);
}
vec3 render(vec3 ro, vec3 rd, vec2 rnd){
  float tw = rd.y < 0. ? -ro.y/rd.y : 1e9, t = march(ro, rd, .5, min(tw, 1400.), 170), th = 1e6; vec3 col;
  if(uMode > 1.5){                                                  // 遮罩：哪些像素是露着的水面、哪些是天
    float ho = isph(ro, rd, OC, OR).x, tt = t > 0. ? t : tw;
    return (t > 0. || (ho > 0. && ho < tt)) ? vec3(0.) : tw < 1e8 ? vec3(1., 0., 0.) : vec3(0., 1., 0.);
  }
  if(t > 0.){ col = fog(shadeSolid(ro+rd*t, rd, t, true), t, rd); th = t; }
  else if(tw < 1e8){ col = fog(water(ro+rd*tw, rd, tw, rnd), tw, rd); th = tw; }
  else col = skyAll(ro, rd, rnd.x, 0);
  shells(ro, rd, th, col);
  return col;
}
void main(){
  SUNC = vec3(1., .975, .92)*2.1*(1.-uNight);
  AMB = mix(vec3(.62, .78, 1.)*.85, vec3(.045, .12, .17), uNight);
  vec2 p = (2.*(gl_FragCoord.xy+uJit)-uRes)/uRes.y;
  vec2 rnd = vec2(h12(gl_FragCoord.xy+uSeed), h12(gl_FragCoord.yx*1.37+uSeed*1.7));
  O = vec4(render(CAM, normalize(vec3(sin(p.x*KX), (p.y+YS)/FV, cos(p.x*KX))), rnd), 1.);
}
