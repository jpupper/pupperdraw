    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform vec2 movec;
    uniform vec2 movecNorm;
    uniform float moLen;
    uniform float radius;
    uniform float softness;
    uniform vec2 noiseOffset;
    uniform float noiseScale;
    uniform float noiseContrast;
    uniform float noiseBrightness;
    uniform float brushOpacity;
    uniform float brushMatAdd;
    uniform int iterations;
    uniform int paintMode;
    uniform bool inverted;
    uniform bool isFirst;
    uniform float uReplace;
    uniform float uGrano;        // 0 = sin capa de ruido, 1 = ruido pleno
    uniform float uGranoEscala;  // frecuencia del ruido de la capa   // 1 = REPLACE (la pincelada pisa lo que habia), 0 = ADD (acumula)

    // cerda Van Gogh: si uBristle = 0 todo sigue exactamente como el original
    uniform float uBristle;
    uniform vec2 uNoiseAxis;
    uniform vec2 uNoiseOrigin;
    uniform vec2 uNoiseSeed;
    uniform float uNoiseStretch;

    // ---- PINCEL CON IMAGEN ----
    // Cuando uUseImg = 1 la forma y el color del sello salen de la textura:
    // el alfa de la imagen es la mascara y su RGB el color de la pintura.
    uniform sampler2D uBrushImg;
    uniform float uUseImg;
    // aspect REAL con el que se muestra el canvas (clientW / clientH). El buffer
    // suele ser 16:9 y la ventana no: sin esto el sello cuadrado sale estirado.
    uniform float uImgClientAspect;


	float hash(vec2 p)  
	{
	    p  = 50.0*fract( p*0.3183099 + vec2(0.71,0.113));
	    return -1.0+2.0*fract( p.x*p.y*(p.x+p.y) );
	}

	float noise( in vec2 p )
	{
	    vec2 i = floor( p );
	    vec2 f = fract( p );
		
		vec2 u = f*f*(3.0-2.0*f);
		vec2 offset = vec2(1.0,0.0);
    return mix( mix( hash( i  ), 
	                     hash( i + offset.xy ), u.x),
	                mix( hash( i + offset.yx ), 
	                     hash( i + offset.xx ), u.x), u.y);
	}
	float turb(vec2 uv)
	{
		float f = 0.;

		uv *= 8.0;
        mat2 m = mat2( 1.6,  1.2, -1.2,  1.6 );
        float fd = 0.5;
        for(int i=0; i<10;i++){
          if(i<iterations){
            f+=fd*noise( uv ); uv = m*uv;
            fd*=noiseContrast;
          }
        }

		f = 0.5 + 0.5*f;
		
	    return smoothstep(noiseBrightness,1.,f) * smoothstep( 0., 0.005, abs(uv.x-0.6) );			
	}
    void main () {
        vec2 p = vUv;
        p -=point;
        p.x *= aspectRatio;
        p *= mat2(movecNorm.y,-movecNorm.x, movecNorm.x, movecNorm.y);
        float d = length(p - vec2(0.,clamp(p.y,-moLen,0.)));
        vec4 baseCol = texture2D(uTarget, vUv);
        vec3 base = baseCol.xyz;

      // ---- PINCEL DE IMAGEN ----
      // Va ANTES del cálculo procedural y SALE con return: si no, la cápsula
      // del pincel (un disco) recortaba el sello y la imagen quedaba con
      // máscara circular. Acá la forma la da el ALFA de la imagen y nada más.
      if (uUseImg > 0.5) {
        float aspImg = (uImgClientAspect > 0.01) ? uImgClientAspect : aspectRatio;
        vec2 ppI = (vUv - point) * vec2(aspImg, 1.0);
        float angI = atan(uNoiseAxis.y, uNoiseAxis.x);
        float caI = cos(-angI), saI = sin(-angI);
        vec2 qI = vec2(ppI.x * caI - ppI.y * saI, ppI.x * saI + ppI.y * caI);
        // radius = semiancho del pincel: el sello ocupa el diámetro
        vec2 uvI = qI / max(radius, 0.0008) * 0.5 + 0.5;
        if (uvI.x < 0.0 || uvI.x > 1.0 || uvI.y < 0.0 || uvI.y > 1.0) {
          gl_FragColor = vec4(0.0);
          return;
        }
        vec4 texI = texture2D(uBrushImg, uvI);
        float mI = clamp(texI.a * brushOpacity, 0.0, 1.0);
        if (mI <= 0.001) { gl_FragColor = vec4(0.0); return; }
        // El delta de color va PREMULTIPLICADO por la máscara: si se manda el
        // color pleno, en los bordes anti-aliasados (alfa chico) el negro del PNG
        // se suma igual y queda un filo negro alrededor del sello.
        // La masa del sello REEMPLAZA (max), no suma: si se acumula sobre el
        // ruido que ya estaba, el relieve viejo sigue mandando en la luz y la
        // imagen parece quedar por detrás de las pinceladas anteriores.
        // REEMPLAZA color y masa: la masa vieja (el ruido que ya estaba) se
        // descuenta con un delta negativo, así el sello queda POR ENCIMA y no
        // por detrás del relieve anterior.
        gl_FragColor = vec4((mix(base, texI.rgb, mI) - base), mI - baseCol.a);
        return;
      }
      float intensity = smoothstep(radius,radius-softness,d);
      if(!isFirst)
        intensity-=smoothstep(radius, radius-softness, length(p - vec2(0.,-moLen)));
      intensity *=brushOpacity;
	    if(intensity==0.)
        discard;

      if(noiseScale<100.){
        vec2 ncoord;
        if (uBristle > 0.5) {
          // coordenadas del trazo: 'a' a lo largo, 'b' a lo ancho
          vec2 rel = vec2(vUv.x*aspectRatio, vUv.y) - uNoiseOrigin;
          float a = dot(rel, uNoiseAxis);
          vec2 perp = vec2(-uNoiseAxis.y, uNoiseAxis.x);
          float b = dot(rel, perp);
          // el ruido se comprime a lo largo -> vetas alargadas en el sentido del trazo
          ncoord = vec2(b, a/max(1.0, uNoiseStretch)) * noiseScale + uNoiseSeed + noiseOffset;
          // estrías de cerda: dos octavas de ruido 1D a través del trazo
          float invr = 1.0/max(radius, 0.0006);
          float s1 = noise(vec2(b*2.0*invr + uNoiseSeed.x*13.0, uNoiseSeed.y*7.0));
          float s2 = noise(vec2(b*4.5*invr + uNoiseSeed.x*31.0, uNoiseSeed.y*17.0));
          float stria = 0.62*s1 + 0.38*s2;
          float ridge = smoothstep(-0.55, 0.05, stria);
          intensity *= mix(0.70, 1.0, ridge);
        } else {
          ncoord = (vec2(vUv.x*aspectRatio, vUv.y)+noiseOffset)*noiseScale;
        }
        float n = turb(ncoord);
        intensity *= mix(1.0,inverted?1.0-n:n,min(1.0,1.5*noiseContrast));
        if (uBristle > 0.5) intensity = clamp(intensity, 0.0, 1.0);
      }
      // ---- CAMPO DE RUIDO DE LA CAPA (modula intensity para que COLOR y MASA sean 1:1) ----
      // La luz del motor sale del gradiente de la masa (alpha) en display_light.frag:
      // al modular intensity directamente, color y relieve comparten exactamente el mismo
      // ruido y la iluminacion responde identica al pincel Vervette original.
      if (uGrano > 0.001) {
        vec2 gp = (vec2(vUv.x * aspectRatio, vUv.y) + uNoiseSeed * 0.371) * max(1.0, uGranoEscala) * 8.0;
        float n1 = noise(gp);
        float n2 = noise(gp * 2.7 + vec2(11.0, 7.0));
        float capa = 0.68 * n1 + 0.32 * n2;                       // -1 .. 1
        float k = uGrano * clamp(capa * 2.6, -1.0, 1.0);
        intensity = clamp(intensity * (1.0 + 0.55 * k), 0.0, 1.0);
      }
      vec3 col = base;
      if(paintMode==0)
      	col = base *(1.0-intensity) +intensity * color;
      else if(paintMode==1)
      	col = base +intensity * color;
      else if(paintMode==2)
        col = base * ((1.0-intensity)+intensity * color);
      else if(paintMode==3){
        vec3 paint = mix(vec3(0.5,0.5,0.5), color, intensity);
        col.r = base.r>0.5?1.-2.*(1.-paint.r)*(1.-base.r):2.*paint.r*base.r;
        col.g = base.g>0.5?1.-2.*(1.-paint.g)*(1.-base.g):2.*paint.g*base.g;
        col.b = base.b>0.5?1.-2.*(1.-paint.b)*(1.-base.b):2.*paint.b*base.b;
      }
      else{
        if((color.r+color.g+color.b)>0.)
          col = mix(col, normalize(color.rgb)*length(col.rgb), intensity);
      }
      float alpha = max(0.,baseCol.a+intensity*brushMatAdd);
      if (uReplace > 0.5) {
        // REPLACE: la pintura nueva pisa la vieja en vez de sumarse (sin acumular relieve)
        col = mix(base, color, clamp(intensity, 0.0, 1.0));
        alpha = mix(baseCol.a, clamp(intensity, 0.0, 1.0), intensity);
      }
      if(alpha>0.)
        gl_FragColor = vec4(col-base, alpha-baseCol.a);
    }
