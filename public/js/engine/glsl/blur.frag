    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uPaint;

    vec2 boundary (in vec2 uv) {
        uv = min(max(uv, 0.0), 1.0);
        return uv;
    }

    void main () {
      float dif = distance(vUv, vL);
      vec4 col = texture2D(uPaint, vUv);
      vec4 bc = texture2D(uPaint, boundary(vL))+texture2D(uPaint, boundary(vR))+
                texture2D(uPaint, boundary(vB))+texture2D(uPaint, boundary(vT))+col; 
      bc *=0.2;                        
      float mass = abs(bc.a-col.a);
      gl_FragColor = mix(col,bc,mass);
    }
