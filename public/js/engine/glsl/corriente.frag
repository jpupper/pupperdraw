    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uAspect;
    uniform vec2 uPos;        // posicion del pincel (uv)
    uniform vec2 uVel;        // desplazamiento por frame (uv), ya escalado y suave
    uniform float uRadio;     // radio de influencia (uv)
    uniform float uCurva;     // desvio perpendicular, fraccion de uVel (veta, NO remolino)

    void main () {
        vec2 d = vUv - uPos;
        d.x *= uAspect;
        float dist = length(d);
        float m = smoothstep(uRadio, 0.0, dist);       // 1 bajo el pincel, 0 lejos

        // la corriente empuja la pintura en la direccion de la mano
        vec2 v = uVel * m;

        // un desvio perpendicular CHICO y constante (sin seno ni tiempo): da la veta
        // de Van Gogh pero no rota la imagen, que era lo que generaba el vortice
        vec2 perp = vec2(-uVel.y, uVel.x);
        v += perp * m * uCurva;

        gl_FragColor = texture2D(uTexture, clamp(vUv - v, 0.001, 0.999));
    }