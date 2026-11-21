/*! NodeGet Aero 主题 · 背景的实时图层
   底图是渲染好的成片（没有肥皂泡和风车）。这里用一个很轻的着色器在上面实时画：
   按波浪算倒影和碎光的水面、漂着的肥皂泡、转动的风车、太阳的光束、水面上的云影、夜里流动的极光。
   镜头和场景里各样东西的位置与 tools/scene/scene.frag 保持一致。没有 WebGL2 时什么都不做，页面显示静态底图。 */
(() => {
'use strict';
const D = document, R = D.documentElement, stage = D.querySelector('.stage');
if (!stage) return;
const cv = D.createElement('canvas'); cv.id = 'live';
const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
if (!gl) return;

const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position = vec4(p*2.-1., 0., 1.); }`;
const FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uA, uB, uM;                       // 白天底图、夜晚底图、遮罩（红=水面，绿=天空）
uniform vec2 uRes;
uniform float uT, uN;                               // 时间（秒）；昼夜混合 0..1
out vec4 O;
#define C(h) pow(vec3(float((h>>16)&255),float((h>>8)&255),float(h&255))/255.,vec3(2.2))
const float KX = .373, FV = 2.68, YS = -.12, AR = 1.7778, HOR = .56;
const vec3 CAM = vec3(0., 1.9, 0.), SUN = normalize(vec3(.4807, .2164, .8498)), OC = vec3(-41., 4.6, 75.6);
const float SX[6] = float[6](2.39, 4.59, 5.7, 8.18, 9.42, 11.71);
const float SZ[6] = float[6](4.39, 7.52, 11.24, 14.22, 17.87, 20.95);
const vec4 TB[6] = vec4[6](vec4(-135., 205., 17., 34.), vec4(-88., 188., 15., 26.), vec4(-95., 560., -1., 62.), vec4(-30., 585., -1., 62.), vec4(40., 570., -1., 62.), vec4(110., 600., -1., 62.));
const vec4 BB[9] = vec4[9](vec4(-1.49, 2.45, 2.55, .2), vec4(-2.41, 3.5, 5.26, .15), vec4(-2.21, 1.07, 3.47, .17), vec4(1.33, 2.23, 2.89, .2), vec4(2.73, 1.96, 4.19, .16),
  vec4(3.4, 3.81, 5.81, .2), vec4(-1.3, 3.7, 7.68, .2), vec4(1.08, 4.53, 9.59, .17), vec4(2.72, 3.8, 11.53, .22));
vec3 SUNC, AMB;
float PIX;

float h12(vec2 p){ vec3 q = fract(vec3(p.xyx)*.1031); q += dot(q, q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vn2(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(h12(i), h12(i+vec2(1,0)), f.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p){ float a = .5, s = 0.; for(int i = 0; i < 4; i++){ s += a*vn2(p); p = p*2.02+vec2(11.3, 5.1); a *= .5; } return s; }

vec3 ray(vec2 uv){ vec2 p = vec2((uv.x*2.-1.)*AR, uv.y*2.-1.); return normalize(vec3(sin(p.x*KX), (p.y+YS)/FV, cos(p.x*KX))); }
vec2 proj(vec3 d){ return vec2(atan(d.x, d.z)/(KX*AR)*.5+.5, (d.y/length(d.xz)*FV-YS)*.5+.5); }
vec3 img(vec2 uv){ vec3 a = texture(uA, uv).rgb; if(uN > 0.) a = mix(a, texture(uB, uv).rgb, uN); return pow(a, vec3(2.2)); }
vec3 tone(vec3 c){ float l = dot(c, vec3(.2126, .7152, .0722)); c = max(mix(vec3(l), c, 1.1), 0.); vec3 k = min(c, vec3(.82)); return k+.18*(1.-exp(-max(c-.82, 0.)/.18)); }
vec3 sky(vec3 rd){
  float h = max(rd.y, 0.);
  vec3 c = mix(mix(C(0xeefaff), C(0x2a7fc4)*.8, uN), mix(C(0xbfe6fa), C(0x0d4a94), uN), smoothstep(0., .05, h));
  c = mix(c, mix(C(0x58b8f2), C(0x07265e), uN), smoothstep(.03, .16, h));
  c = mix(c, mix(C(0x1e8fe6), C(0x03112e), uN), smoothstep(.12, .42, h));
  float sd = max(dot(rd, SUN), 0.);
  return c+SUNC*(pow(sd, 6.)*.06+pow(sd, 40.)*.11+pow(sd, 400.)*.4);
}
vec3 fog(vec3 col, float t, vec3 rd){ return mix(col, sky(normalize(vec3(rd.x, .012, rd.z)))*.97, 1.-exp(-t*.00066)); }

// 风力发电机：塔、机舱、三片转动的叶片。返回颜色和覆盖度
vec4 turb(vec3 ro, vec3 rd){
  vec4 acc = vec4(0.); vec2 dz = normalize(rd.xz); float lz = length(rd.xz);
  for(int i = 0; i < 6; i++){
    vec4 T = TB[i]; float H = T.w, fi = float(i); vec3 b = vec3(T.x, T.z, T.y), hub = b+vec3(0., H, 0.);
    vec2 oc = hub.xz-ro.xz; float tm = dot(oc, dz); if(tm < 1.) continue;
    float side = oc.x*dz.y-oc.y*dz.x, lat = abs(side); if(lat > H*.52) continue;
    float tt = tm/lz, px = tt*PIX*1.3, y = ro.y+rd.y*tt;
    float rT = H*.018*(1.+.7*clamp((hub.y-y)/H, 0., 1.));
    float dT = max(lat-rT, max(y-hub.y, b.y-y)), dN = length(vec2(lat, y-hub.y))-H*.034, dB = 1e9;
    vec2 s = (ro+rd*((hub.z-2.4-ro.z)/rd.z)).xy-hub.xy;
    float ang = fi*1.3+.4+uT*(H < 40. ? 1.15 : .62)*(.85+.3*fract(fi*.37));
    for(int k = 0; k < 3; k++){ float a = ang+float(k)*2.0944; vec2 dr = vec2(cos(a), sin(a)); float h = clamp(dot(s, dr), 0., H*.48); dB = min(dB, length(s-dr*h)-H*.014*(1.-.55*h/(H*.48))); }
    float d = min(min(dT, dN), dB), al = smoothstep(px, -px, d); if(al <= 0.) continue;
    float lit = d == dT ? .5+.5*clamp(-side/max(rT, .01), -1., 1.) : .45;
    vec3 c = fog(vec3(.86, .88, .9)*(AMB*.62+SUNC*.16*lit), tt, rd);
    acc = vec4(mix(acc.rgb, c, al), max(acc.a, al));
  }
  return acc;
}

// 水：波浪推动的镜子。倒影取自底图里地平线以上的部分，远处上下抹开；朝太阳的方向有碎光
float wh(vec2 p){ return fbm2(p*.6+vec2(uT*.09, uT*.05))*.22+vn2(p*2.3+11.+vec2(-uT*.28, uT*.19))*.05+vn2(p*6.+3.+vec2(uT*.45, -uT*.33))*.012; }
vec3 water(vec3 rd){
  float t = -CAM.y/rd.y; vec3 p = CAM+rd*t;
  float a = 1./(1.+t*.03+t*t*.00035), e = .06, h0 = wh(p.xz), far = smoothstep(15., 300., t);   // 远处一个像素里有很多个波，画不出来，就把波压平、改成上下抹开
  vec3 n = normalize(vec3(-(wh(p.xz+vec2(e, 0.))-h0)/e*a, 1., -(wh(p.xz+vec2(0., e))-h0)/e*a));
  vec3 r = reflect(rd, n); r.y = abs(r.y)+.002; r = normalize(r);
  float fr = .02+.98*pow(1.-max(dot(n, -rd), 0.), 5.);
  vec2 ur = proj(r); vec3 refl = vec3(0.);
  for(int k = -1; k <= 1; k++){ vec2 u = ur+vec2(0., float(k)*.014*far); u.y = max(u.y, HOR+.003); refl += (u.y > .995 || u.x < .002 || u.x > .998) ? sky(r) : img(u); }
  refl /= 3.;
  vec4 tr = turb(p+vec3(0., .02, 0.), r); refl = mix(refl, tr.rgb, tr.a);
  vec3 body = mix(C(0x2fb6ee), C(0x0b7fd0), smoothstep(0., 90., t))*(.5+.5*max(dot(n, SUN), 0.)*2.)*mix(1., .12, uN);
  vec3 col = mix(body, refl, fr);
  col += SUNC*min(pow(max(dot(r, SUN), 0.), 1400.)*60., 6.);
  col *= 1.-.15*(1.-uN)*smoothstep(.48, .72, fbm2(p.xz*.007+vec2(uT*.02, uT*.008)));      // 云影慢慢滑过水面
  float ring = smoothstep(.3, 0., abs(length(p.xz-OC.xz)-5.28));
  for(int i = 0; i < 6; i++) ring = max(ring, .5*smoothstep(.12, 0., abs(length(p.xz-vec2(SX[i], SZ[i]))-1.16)));
  col = mix(col, vec3(.95, .98, 1.)*(1.-uN*.7), ring*.7);
  return tone(fog(col, t, rd));
}

// 肥皂泡：很薄的膜，只叠反光；慢慢漂
vec3 envCheap(vec3 d){ return d.y >= 0. ? sky(d) : mix(C(0x1f9be6)*.7*(1.-.8*uN), sky(vec3(d.x, -d.y, d.z)), .55); }
void bubbles(vec3 ro, vec3 rd, inout vec3 col){
  for(int i = 0; i < 9; i++){
    float fi = float(i); vec4 B = BB[i];
    vec3 c = B.xyz+vec3(.32*sin(uT*.13+fi*1.7), .26*sin(uT*.19+fi*2.3)+.1*sin(uT*.47+fi), .25*cos(uT*.11+fi*.9));
    float Rr = B.w*(1.+.025*sin(uT*.9+fi*3.1));
    vec3 oc = ro-c; float b = dot(oc, rd), dp = sqrt(max(dot(oc, oc)-b*b, 0.)); if(b > 0. || dp >= Rr) continue;
    float h = sqrt(Rr*Rr-dp*dp), aa = smoothstep(0., 1.5*-b*PIX, Rr-dp);
    vec3 n = normalize(ro+rd*(-b-h)-c), r1 = reflect(rd, n), n2 = normalize(ro+rd*(-b+h)-c), r2 = reflect(rd, -n2);
    float cs = max(dot(n, -rd), 0.), fr = pow(1.-cs, 2.6);
    vec3 tint = mix(vec3(1.), .55+.45*cos(6.2831*((1.-cs)*2.6+n.y*1.4+uT*.04+vec3(0., .33, .67))), .6);
    vec3 add = envCheap(r1)*tint*(.04+.95*fr)+SUNC*pow(max(dot(r1, SUN), 0.), 900.)*10.;
    add += mix(vec3(1.), vec3(.6, .95, .9), uN)*pow(max(dot(r1, normalize(vec3(-.55, .62, -.56))), 0.), 26.)*mix(.5, .22, uN);
    add += envCheap(r2)*tint*(.02+.35*pow(1.-max(dot(n2, rd), 0.), 3.))*.6+SUNC*pow(max(dot(r2, SUN), 0.), 900.)*4.;
    col = mix(col, col*mix(vec3(.985, .995, 1.), vec3(.86, .94, .98), fr)+add, aa);
  }
}

void main(){
  SUNC = vec3(1., .975, .92)*2.1*(1.-uN);
  AMB = mix(vec3(.62, .78, 1.)*.85, vec3(.045, .12, .17), uN);
  PIX = 2.*AR*KX/uRes.x;
  vec2 uv = gl_FragCoord.xy/uRes; vec3 rd = ray(uv), m = texture(uM, uv).rgb, col = img(uv);
  if(m.r > .004 && rd.y < -.0005) col = mix(col, water(rd), m.r);
  if(uN > 0. && m.g > 0.){                                    // 夜里极光在流动
    float az = atan(rd.x, rd.z), band = smoothstep(.15, .22, rd.y)*(1.-smoothstep(.36, .5, rd.y));
    col *= 1.+uN*m.g*band*(vn2(vec2(az*36.+uT*.22, rd.y*5.-uT*.1))-.5)*1.1;
  }
  vec4 tr = turb(CAM, rd); col = mix(col, tone(tr.rgb), tr.a);
  vec2 d = (uv-proj(SUN))*vec2(AR, 1.); float ang = atan(d.y, d.x);                // 太阳的光束，慢慢转
  col += SUNC*vec3(1., .97, .9)*vn2(vec2(ang*7.+uT*.04, uT*.03))*vn2(vec2(ang*19.-uT*.03, 4.+uT*.02))*exp(-length(d)*2.4)*.16;
  bubbles(CAM, rd, col);
  O = vec4(pow(clamp(col, 0., 1.), vec3(1./2.2)), 1.);
}`;

const prog = gl.createProgram();
for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[aero live]', gl.getShaderInfoLog(s)); return; }
  gl.attachShader(prog, s);
}
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('[aero live]', gl.getProgramInfoLog(prog)); return; }
gl.useProgram(prog); gl.bindVertexArray(gl.createVertexArray());
const U = n => gl.getUniformLocation(prog, n);
const uRes = U('uRes'), uT = U('uT'), uN = U('uN');
gl.uniform1i(U('uA'), 0); gl.uniform1i(U('uB'), 1); gl.uniform1i(U('uM'), 2);

// 和样式表里选图的条件一致：大屏或高分屏用 2560 的底图
const sfx = matchMedia('(min-width:1280px),(min-resolution:1.5dppx)').matches ? '' : '-s';
const load = (unit, url) => new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => {
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    res();
  };
  im.onerror = rej; im.src = url;
});
const dayUrl = `./scene-day${sfx}.jpg?v=3`, nightUrl = `./scene-night${sfx}.jpg?v=3`, maskUrl = `./scene-mask${sfx}.png?v=3`;
const isNight = () => R.classList.contains('night'), isStill = () => R.classList.contains('still');
let haveNight = false, loadingNight = false, mixN = 0, clock = 20, last = 0, raf = 0, q = 1, sx = 0, sy = 0, sw = 0, sh = 0, frames = 0, slow = 0, drops = 0, half = false, tick = 0, dead = false;

function size() {
  const r = stage.getBoundingClientRect(); if (!r.width) return;
  let s = Math.min(devicePixelRatio || 1, 1.5) * q; s = Math.min(s, Math.sqrt(3.4e6 / (r.width * r.height)));
  const w = Math.round(r.width * s), h = Math.round(r.height * s);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  // 只画屏幕里看得见的那一块（竖屏时画面比屏幕宽得多）
  sx = Math.max(0, Math.floor(-r.left * s)); sw = Math.min(w, Math.ceil((innerWidth - r.left) * s)) - sx;
  sy = Math.max(0, Math.floor((r.bottom - innerHeight) * s)); sh = Math.min(h, Math.ceil(r.bottom * s)) - sy;
}
function needNight() {
  if (haveNight || loadingNight) return;
  loadingNight = true;
  load(1, nightUrl).then(() => { haveNight = true; kick(); }, () => { loadingNight = false; });
}
function draw(now) {
  raf = 0; if (dead) return;
  if (half && (tick++ & 1) && !isStill()) { raf = requestAnimationFrame(draw); return; }      // 机器吃力时隔一帧画一次
  const dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
  const still = isStill(), target = isNight() && haveNight ? 1 : 0;
  if (!still) clock += dt;
  mixN += Math.max(-dt / 1.4, Math.min(dt / 1.4, target - mixN));
  gl.viewport(0, 0, cv.width, cv.height); gl.enable(gl.SCISSOR_TEST); gl.scissor(sx, sy, Math.max(1, sw), Math.max(1, sh));
  gl.uniform2f(uRes, cv.width, cv.height); gl.uniform1f(uT, clock); gl.uniform1f(uN, mixN);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // 帧时间一直偏长就降一档分辨率，最多三次；还不行就改成隔帧绘制
  if (!still && !half && dt > 0) { frames++; if (dt > .03) slow++; if (frames >= 90) { if (slow > 45) { if (drops < 3) { q *= .75; drops++; size(); } else half = true; } frames = slow = 0; } }
  if (!still || mixN !== target) raf = requestAnimationFrame(draw); else last = 0;
}
function kick() { if (!raf && !dead) raf = requestAnimationFrame(draw); }

Promise.all([load(0, dayUrl), load(2, maskUrl)]).then(() => {
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
  if (isNight()) needNight();
  stage.append(cv); size(); kick();
  requestAnimationFrame(() => requestAnimationFrame(() => cv.classList.add('on')));
  new ResizeObserver(() => { size(); kick(); }).observe(stage);
  addEventListener('resize', () => { size(); kick(); });
  new MutationObserver(() => { if (isNight()) needNight(); kick(); }).observe(R, { attributes: true, attributeFilter: ['class'] });
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); dead = true; cv.remove(); });
}).catch(() => {});
})();
