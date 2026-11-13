    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;

    vec2 boundary (in vec2 uv) {
        uv = min(max(uv, 0.0), 1.0);
        return uv;
    }

    void main () {
        float h = texture2D(uPressure, boundary(vL)).x-texture2D(uPressure, boundary(vR)).x;
        float v = texture2D(uPressure, boundary(vB)).x-texture2D(uPressure, boundary(vT)).x;         
        gl_FragColor = vec4(texture2D(uVelocity, vUv).xy+ vec2(h, v), 0.0, 1.0);
    }
