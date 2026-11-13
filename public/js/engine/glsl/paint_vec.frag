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
    uniform float softness;
    uniform float radius;
    uniform vec2 noiseOffset;
    uniform float noiseScale;
    uniform float noiseContrast;
    uniform float noiseBrightness;
    uniform int iterations;
    uniform bool isAdditive;
    uniform bool inverted;
    uniform bool isFirst;

    uniform float uBristle;
    uniform vec2 uNoiseAxis;
    uniform vec2 uNoiseOrigin;
    uniform vec2 uNoiseSeed;
    uniform float uNoiseStretch;

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
        vec3 base = texture2D(uTarget, vUv).xyz;
      float intensity = smoothstep(radius,radius-softness,d);
      //if(!isFirst)
      //  intensity-=smoothstep(radius,radius-softness,length(p - vec2(0.,-moLen)));
      if(intensity==0.)
        discard;
      
      if(noiseScale<100.){
        vec2 ncoord;
        if (uBristle > 0.5) {
          vec2 rel = vec2(vUv.x*aspectRatio, vUv.y) - uNoiseOrigin;
          float a = dot(rel, uNoiseAxis);
          vec2 perp = vec2(-uNoiseAxis.y, uNoiseAxis.x);
          float b = dot(rel, perp);
          ncoord = vec2(b, a/max(1.0, uNoiseStretch)) * noiseScale + uNoiseSeed + noiseOffset;
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
      if(!isAdditive)
        base*=(1.0-intensity);
      vec3 paint =  intensity * color;
      gl_FragColor = vec4(base + paint, intensity);
    }
