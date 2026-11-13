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

    // Relieve de la cerda. La luz del motor sale del GRADIENTE de la masa y es un
    // gradiente ABSOLUTO (no relativo), así que la masa necesita dos cosas para hacer
    // sombra como el pincel original: nivel suficiente y ruido propio encima.
    const float VG_RELIEVE   = 2.30;  // escala de la masa en modo cerda
    const float VG_KRELIEVE  = 0.55;  // cuánto perturba el ruido a la masa
    const float VG_MASSCEIL  = 4.00;  // techo: más bajo CLIPEA los picos del ruido y aplana


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
        intensity *= mix(1.0,inverted?1.0-n:n,min(1.0,1.5*noiseContrast)*(uBristle>0.5?0.25:1.0));
        if (uBristle > 0.5) intensity = clamp(intensity, 0.0, 1.0);
      }
      // ---- CAMPO DE RUIDO DE LA CAPA (uno solo para el COLOR y para la MASA) ----
      // La luz del motor sale del gradiente de la masa (alpha) en display_light.frag:
      // si el ruido vive SOLO en el color, la pincelada se ve plana (el grano no hace
      // sombra). Con el mismo campo perturbando los dos, la luz revela el grano que se ve.
      vec2 gp = (vec2(vUv.x * aspectRatio, vUv.y) + uNoiseSeed * 0.371) * max(1.0, uGranoEscala) * 8.0;
      float n1 = noise(gp);
      float n2 = noise(gp * 2.7 + vec2(11.0, 7.0));
      float capa = 0.68 * n1 + 0.32 * n2;                       // -1 .. 1
      // CAPA DE RUIDO (sobre el COLOR y la MASA, no sobre la intensidad).
      // Multiplicar intensity no deja grano: el pase escribe un delta contra la base y con
      // muchas pasadas la mancha converge al mismo color. Perturbando el color objetivo y
      // la masa, el ruido SI queda en el resultado. Con uGrano = 0 no cambia nada.
      vec3 colBrush = color;
      float mGrano = 1.0;
      if (uGrano > 0.001) {
        // el value-noise promedia ~0.2: se normaliza para que el grano se note
        float k = uGrano * clamp(capa * 2.6, -1.0, 1.0);           // -1 .. 1 * fuerza
        mGrano = clamp(1.0 + 0.65 * k, 0.28, 1.85);                // factor de masa
        // color: parte multiplicativa (oscurece/aclara) + parte aditiva (se ve tambien en claros)
        colBrush = clamp(color * (1.0 + 0.62 * k) + vec3(0.13 * k), 0.0, 1.0);
      }
      vec3 col = base;
      if(paintMode==0)
      	col = base *(1.0-intensity) +intensity * colBrush;
      else if(paintMode==1)
      	col = base +intensity * colBrush;
      else if(paintMode==2)
        col = base * ((1.0-intensity)+intensity * colBrush);
      else if(paintMode==3){
        vec3 paint = mix(vec3(0.5,0.5,0.5), colBrush, intensity);
        col.r = base.r>0.5?1.-2.*(1.-paint.r)*(1.-base.r):2.*paint.r*base.r;
        col.g = base.g>0.5?1.-2.*(1.-paint.g)*(1.-base.g):2.*paint.g*base.g;
        col.b = base.b>0.5?1.-2.*(1.-paint.b)*(1.-base.b):2.*paint.b*base.b;
      }
      else{
        if((color.r+color.g+color.b)>0.)
          col = mix(col, normalize(colBrush.rgb)*length(col.rgb), intensity);
      }
      float alpha = max(0.,baseCol.a+intensity*brushMatAdd*mGrano);
      if (uBristle > 0.5) {
        // La masa NO se suma entre pasos: si no, cada paso de la cápsula
        // (y cada trazo vecino) deja una cuenta y el trazo se ve segmentado.
        // Tomamos el máximo -> el relieve sigue las vetas de la cerda.
        // El ruido va en la MASA (no solo en el color): mismo campo que el grano del color
        // más una octava fina, para que la luz haga sombra dentro de la pincelada.
        vec2 gpf = gp * 3.1;
        float capaF = 0.62 * noise(gpf) + 0.38 * noise(gpf * 2.7 + vec2(11.0, 7.0));
        float kMas = mix(clamp(capa * 2.6, -1.0, 1.0), clamp(capaF * 2.6, -1.0, 1.0), 0.80)
                   * (0.85 + 0.35 * uGrano);
        float mMasa = intensity * (1.0 + brushMatAdd) * mix(1.0, mGrano, 0.95)
                    * max(0.0, 1.0 + VG_KRELIEVE * kMas) * VG_RELIEVE;
        alpha = min(max(baseCol.a, mMasa), VG_MASSCEIL);
      }
      if (uReplace > 0.5) {
        // REPLACE: la pintura nueva pisa la vieja en vez de sumarse (sin acumular relieve)
        col = mix(base, color, clamp(intensity, 0.0, 1.0));
        alpha = mix(baseCol.a, clamp(intensity, 0.0, 1.0), intensity);
      }
      if(alpha>0.)
        gl_FragColor = vec4(col-base, alpha-baseCol.a);
    }
