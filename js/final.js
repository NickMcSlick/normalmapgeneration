// CS6410 Final Project 4/18/22 Bryce Paubel
// This project takes in multiple local images and uses FBOs
// and a variation of Sobel Masking to generate a normal map

// Image display vertex shader
// Based off of HW3
const vertexImgDisplay = `#version 300 es
	in vec2 a_Position;	
	out vec2 v_Coord;

	void main() {	   
	   gl_PointSize = 1.0;
	   gl_Position = vec4(a_Position, 0.0, 1.0);

	   v_Coord = a_Position * 0.5 + 0.5;
	}
`;

// Image display fragment shader
// Based off of HW3
const fragImgDisplay = `#version 300 es
	precision mediump float;
	precision highp sampler2D;

	uniform sampler2D u_Image;
	in vec2 v_Coord;

	out vec4 cg_FragColor; 

	void main() {
	   cg_FragColor = texture(u_Image, v_Coord);
	}
`;

// Image urls
let imgs = [
	new Image("../img/earth.jpg"),
	new Image("../img/mars.jpg"),
	new Image("../img/wood.jpg")
]

// Canvas variables, contexts, programs, and VAOs
let diffuseCanvas, normalCanvas;
let glDiffuse, glNormal;
let diffuseProg, normalProg;
let vaoImageDiffuse, vaoImageNormal;
let animID;

function main() {
	diffuseCanvas = document.getElementById("diffuseCanvas");
	normalCanvas = document.getElementById("normalCanvas");
	
	// Height here is hardcoded, just so nice texture images are sized
	diffuseCanvas.width = normalCanvas.width = 512;
	normalCanvas.height = normalCanvas.height = 512;

	glDiffuse = diffuseCanvas.getContext("webgl2");
	glNormal = normalCanvas.getContext("webgl2");

	loadAndSetupImages(imgs, glDiffuse, glNormal);

	diffuseProg = new GLProgram(vertexImgDisplay, fragImgDisplay, glDiffuse);
	normalProg = new GLProgram(vertexImgDisplay, fragImgDisplay, glNormal);

	vaoImageDiffuse = createVaoImage(glDiffuse);
	vaoImageNormal = createVaoImage(glNormal);

	glDiffuse.bindVertexArray(vaoImageDiffuse);
	glNormal.bindVertexArray(vaoImageNormal);

	let update = function() {
		cancelAnimationFrame(animID);
		glNormal.clearColor(0.0, 0.0, 0.0, 1.0);
		glDiffuse.clearColor(0.0, 0.0, 0.0, 1.0);
		glDiffuse.drawElements(glDiffuse.TRIANGLES, 6, glDiffuse.UNSIGNED_SHORT, 0);
		glNormal.drawElements(glNormal.TRIANGLES, 6, glNormal.UNSIGNED_SHORT, 0);
	}

	update();
}

// Load and set up the images
function loadAndSetupImages(images, gl1, gl2) {
	for (let img in images) {
		img.onload = function() {
			// Set up the images for first context
			gl1.pixelStorei(gl1.UNPACK_FLIP_Y_WEBGL, 1);
			gl1.activeTexture(gl1.TEXTURE0 + i);
			gl1.bindTexture(gl1.TEXTURE_2D, gl1.createTexture());
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_WRAP_S, gl1.CLAMP_TO_EDGE);
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_WRAP_T, gl1.CLAMP_TO_EDGE);
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_MIN_FILTER, gl1.LINEAR);
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_MAG_FILTER, gl1.LINEAR);
			gl1.texImage2D(gl1.TEXTURE_2D, 0, gl1.RGBA, gl1.RGBA, gl1.UNSIGNED_BYTE, img);
			
			// Set up the images for second context
			gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, 1);
			gl2.activeTexture(gl2.TEXTURE0 + i);
			gl2.bindTexture(gl2.TEXTURE_2D, gl2.createTexture());
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
			gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, img);
		}
	}
}


// Check if images are loaded
function areImagesLoaded(images) {
	for (let img in images) {
		if (!img.complete)
			return false;
	}
	return true;
}

// Create a VAO image
function createVaoImage(gl) {
	vaoImage = gl.createVertexArray();
  	gl.bindVertexArray(vaoImage);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    
    gl.bindVertexArray(null);

	return vaoImage;
}

/***** DATA STRUCTURE FROM CLASS *****/
class GLProgram {
    constructor (vertex_shader, frag_shader, gl) {
        this.attributes = {};
        this.uniforms = {};
        this.program = gl.createProgram();

        this.program = cg_init_shaders(gl, vertex_shader, frag_shader);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            throw gl.getProgramInfoLog(this.program);
        
        // register attribute variables
        const attribute_count = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
        for (let i = 0; i < attribute_count; i++) {
            const attribute_name = gl.getActiveAttrib(this.program, i).name;
            this.attributes[attribute_name] = gl.getAttribLocation(this.program, attribute_name);
        }

        // register uniform variables
        const uniform_count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniform_count; i++) {
            const uniform_name = gl.getActiveUniform(this.program, i).name;
            this.uniforms[uniform_name] = gl.getUniformLocation(this.program, uniform_name);
        }
    }

    bind (gl) {
        gl.useProgram(this.program);
    }
}

//***** FUNCTION USED IN CLASS *****/
function cg_init_shaders(gl, vshader, fshader) {
  var program = createProgram(gl, vshader, fshader);

  return program;
}

