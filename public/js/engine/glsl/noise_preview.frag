    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform vec2 noiseOffset;
    uniform float noiseScale;
    uniform float noiseContrast;
    uniform float noiseBrightness;
    uniform int iterations;
    uniform bool inverted;


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
    return mix( mix( hash( i  ),  hash( i + offset.xy ), u.x),
                mix( hash( i + offset.yx ), hash( i + offset.xx ), u.x), u.y);
  }
  float turb(vec2 uv)
  {
    float f = 0.;

    uv *= 8.0;
        mat2 m = mat2( 1.6,  1.2, -1.2,  1.6 );
        float fd = 0.5;
        for(int i=0; i<11;i++){
          if(i<iterations){
            f+=fd*noise( uv ); uv = m*uv;
            fd*=noiseContrast;
          }
        }

    f = 0.5 + 0.5*f;
    
      return smoothstep(noiseBrightness,1.,f) * smoothstep( 0., 0.005, abs(uv.x-0.6) );     
  }
  void main () {
    float n = 1.0;
    if(noiseScale<100.)
      n = mix(1.0,turb((vUv+noiseOffset)*noiseScale),min(1.0,1.5*noiseContrast));
    if(inverted)
      n = 1.0-n;
    gl_FragColor = vec4(n,n,n,1. );
  }
