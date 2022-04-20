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


// NORMAL MAP GENERATION USING SOBEL MASKING
// This is the major part of the project, attempting to tweak the normal maps
const fragSobelNormalGeneration = `#version 300 es
	precision highp float; 
    precision highp sampler2D;
    
    in vec2 v_Coord;
    uniform sampler2D u_Image;
    uniform vec2 u_Texel; // added by hk
    uniform float u_Scale;
	uniform float u_NormalHeight;
	uniform bool u_SwapDirection;

    out vec4 cg_FragColor;
        
    void main () {
        float x = v_coord.x;
        float y = v_coord.y;
        float dx = u_texel.x;
        float dy = u_texel.y;    
  
        vec2 g = vec2(0.0);

        g.x = (          
			-1.0 * texture(u_image, vec2(x-dx, y-dy)).r +
			-2.0 * texture(u_image, vec2(x-dx, y)).r +
			-1.0 * texture(u_image, vec2(x-dx, y+dy)).r +
			+1.0 * texture(u_image, vec2(x+dx, y-dy)).r +
			+2.0 * texture(u_image, vec2(x+dx, y)).r +
			+1.0 * texture(u_image, vec2(x+dx, y+dy)).r		
		); // [-4, 4] because texture returns [0, 1]		   

		g.y = (		
			-1.0 * texture(u_image, vec2(x-dx, y-dy)).r +
			-2.0 * texture(u_image, vec2(x,    y-dy)).r +
			-1.0 * texture(u_image, vec2(x+dx, y-dy)).r +
			+1.0 * texture(u_image, vec2(x-dx, y+dy)).r +
			+2.0 * texture(u_image, vec2(x,    y+dy)).r +
			+1.0 * texture(u_image, vec2(x+dx, y+dy)).r		
		); // [-4, 4] because texture returns [0, 1]		   
		
		g.x /= 4.0; // [-1, 1]
	    g.y /= 4.0; // [-1, 1]	
	    
		float mag = g.x * g.x + g.y * g.y; // [0, 2]
	    mag /= 2.0; // [0, 1]	   	   

        // if zero gradient, make it a vertical tangent vector
        if (g.x == 0.0 && g.y == 0.0) g = vec2(1.0, 0.0); 

		if (u_swap_direction) {
			g.x = -g.x;
			g.y = -g.y;
		}
		
	    g = normalize(g); // [-1, 1]

	    g = (g + 1.0) / 2.0; // [0, 1]

        /////////////////////////////////////////
        // enhance gradient magnitude
	    mag = tanh(u_scale * mag);
	    /////////////////////////////////////////

	    //cg_FragColor = vec4(mag, mag, mag, 1.0);
	
		cg_FragColor = mix(vec4(g, u_normal_height, 1.0), vec4(0.5, 0.5, 1.0, 1.0), 1.0 - mag);	
    }       
`;



// Image urls
let imgUrls = [
	"../img/earth.jpg",
	"../img/mars.jpg",
	"../img/wood.jpg"
]

// Will hold the image objects
let imgs = []

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
	diffuseCanvas.height = normalCanvas.height = 512;

	glDiffuse = diffuseCanvas.getContext("webgl2");
	glNormal = normalCanvas.getContext("webgl2");

	loadAndSetupImages(imgUrls, glDiffuse, glNormal);

	diffuseProg = new GLProgram(vertexImgDisplay, fragImgDisplay, glDiffuse);
	normalProg = new GLProgram(vertexImgDisplay, fragImgDisplay, glNormal);

	vaoImageDiffuse = createVaoImage(glDiffuse);
	vaoImageNormal = createVaoImage(glNormal);

	glDiffuse.bindVertexArray(vaoImageDiffuse);
	glNormal.bindVertexArray(vaoImageNormal);

	diffuseProg.bind(glDiffuse);
	normalProg.bind(glNormal);

	glNormal.getExtension('EXT_color_buffer_float');

	preGaussFbo = create_double_fbo(glNormal, 512, 512, glNormal.RGBA16F, glNormal.RGBA, glNormal.HALF_FLOAT, glNormal.LINEAR, false);
	sobelMaskNormalFbo = create_double_fbo(glNormal, 512, 512, glNormal.RGBA16F, glNormal.RGBA, glNormal.HALF_FLOAT, glNormal.LINEAR, false);
	postGaussFbo = create_double_fbo(glNormal, 512, 512, glNormal.RGBA16F, glNormal.RGBA, glNormal.HALF_FLOAT, glNormal.LINEAR, false);
	
	let update = function() {
							 
	if (areImagesLoaded(imgs)) {
			glNormal.clearColor(0.0, 0.0, 0.0, 1.0);
			glNormal.clear(glNormal.COLOR_BUFFER_BIT);
			glDiffuse.clearColor(0.0, 0.0, 0.0, 1.0);
			glDiffuse.clear(glDiffuse.COLOR_BUFFER_BIT);
			cancelAnimationFrame(animID);
			glDiffuse.uniform1i(diffuseProg.u_Image, 0);
			glNormal.uniform1i(diffuseProg.u_Image, 0);
			glNormal.clearColor(0.0, 0.0, 0.0, 1.0);
			glDiffuse.clearColor(0.0, 0.0, 0.0, 1.0);
			glDiffuse.drawElements(glDiffuse.TRIANGLES, 6, glDiffuse.UNSIGNED_SHORT, 0);

			renderImgToFbo(glNormal, normalProg, preGaussFbo);
			sobelNormalMap(glNormal, normalProg, preGaussFbo, sobelMaskNormalFbo, 1.0, 1.0, false);
			renderToScreen(glNormal, normalProg, sobelMaskNormalFbo);
		}
		animID = requestAnimationFrame(update);
	}

	update();
}

// Load and set up the images
function loadAndSetupImages(imageUrls, gl1, gl2) {
	for (let i in imageUrls) {
		console.log(i);
		let img = new Image();
		img.src = imageUrls[parseInt(i)];
		img.width = 512;
		img.height = 512;
		img.crossOrigin = "";
		img.onload = function() {
			// Set up the images for first context
			gl1.pixelStorei(gl1.UNPACK_FLIP_Y_WEBGL, 1);
			gl1.activeTexture(gl1.TEXTURE0 + parseInt(i));
			gl1.bindTexture(gl1.TEXTURE_2D, gl1.createTexture());
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_WRAP_S, gl1.CLAMP_TO_EDGE);
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_WRAP_T, gl1.CLAMP_TO_EDGE);
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_MIN_FILTER, gl1.LINEAR);
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_MAG_FILTER, gl1.LINEAR);
			gl1.texImage2D(gl1.TEXTURE_2D, 0, gl1.RGBA, gl1.RGBA, gl1.UNSIGNED_BYTE, img);
			
			// Set up the images for second context
			gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, 1);
			gl2.activeTexture(gl2.TEXTURE0 + parseInt(i));
			gl2.bindTexture(gl2.TEXTURE_2D, gl2.createTexture());
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
			gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, img);
		}
		
		imgs.push(img);
	}
}


// Check if images are loaded
function areImagesLoaded(images) {
	for (let i in images) {
		if (!imgs[parseInt(i)].complete)
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

// Render to the screen
function renderToScreen(gl, prog, fbo) {
	gl.uniform1i(prog.uniforms.u_Image, 1);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.drawElements(glNormal.TRIANGLES, 6, glNormal.UNSIGNED_SHORT, 0);
}

/***** BASED ON HW3 *****/
// Sobel normal mask drawing
function sobelNormalMap(gl, prog, ori, dst, scale, normalHeight, swap) {
    let program = prog;
    program.bind(gl);

    gl.uniform1i(program.uniforms.u_Image, ori.read.attach(1));
    gl.uniform2f(program.uniforms.u_Texel, ori.texel_x, ori.texel_y);
    gl.uniform1f(program.uniforms.u_Scale, scale);
	gl.uniform1f(program.uniforms.u_NormalHeight, normalHeight);
	gl.uniform1f(program.uniforms.u_SwapDirection, swap);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

	gl.bindFramebuffer(gl.FRAMEBUFFER, ori.write.fbo);

	gl.drawElements(glNormal.TRIANGLES, 6, glNormal.UNSIGNED_SHORT, 0);
	
    dst.swap();
}

/***** BASED ON HW3 *****/
// Sobel normal mask drawing
function renderImgToFbo(gl, prog, fbo) {
    let program = prog;
    program.bind(gl);

	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.read.fbo);

    gl.uniform1i(program.uniforms.u_Image, 0);
    gl.uniform2f(program.uniforms.u_Texel, fbo.read.fbo.texel_x, fbo.read.fbo.texel_y);
	
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

	gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
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

/***** FBOS FROM CLASS *****/
// When attaching a texture to a framebuffer, all rendering commands will 
// write to the texture as if it was a normal color/depth or stencil buffer.
// The advantage of using textures is that the result of all rendering operations
// will be stored as a texture image that we can then easily used in shaders
function create_fbo (gl, w, h, internalFormat, format, type, param, depth) {

    //gl.activeTexture(gl.TEXTURE0);
    gl.activeTexture(gl.TEXTURE8); 
    // use high number to avoid confusion with ordinary texture images

    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    // create texture image of resolution (w x h)
    // note that here we pass null as texture source data (no texture image source)
    // For this texture, we're only allocating memory and not actually filling it.
    // Filling texture will happen as soon as we render to the framebuffer.    
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    // make created fbo our main framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    // attach texture to framebuffer so from now on, everything will be 
    // drawn on this texture image    
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    
	// create a depth renderbuffer
	let depth_buffer = gl.createRenderbuffer();
	gl.bindRenderbuffer(gl.RENDERBUFFER, depth_buffer);

    if (depth) {
		// make a depth buffer and the same size as the targetTexture
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth_buffer);
    }
    
    // if you want to render your whole screen to a texture of a smaller or larger size
    // than the screen, you need to call glViewport again 
    // (before rendering to your framebuffer) with the new dimensions of your texture, 
    // otherwise only a small part of the texture or screen would be drawn onto the texture
    gl.viewport(0, 0, w, h);
    // because framebuffer dimension has changed
    gl.clear(gl.COLOR_BUFFER_BIT);

    let texel_x = 1.0 / w;
    let texel_y = 1.0 / h;

    return {
        texture,
        fbo,
        depth_buffer,
        single: true, // single fbo
        width: w,
        height: h,
        texel_x,
        texel_y,
        internalFormat,
        format,
        type,
        attach(id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            // gl.TEXTURE0, gl.TEXTURE1, ...
            gl.bindTexture(gl.TEXTURE_2D, texture);
            // gl.TEXTURE_2D is now filled by this texture
            return id;
        },
        addTexture(pixel) {
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);// do not flip the image's y-axis
			gl.bindTexture(gl.TEXTURE_2D, texture); // fill TEXTURE_2D slot with this FBO's texture 
			gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, gl.FLOAT, pixel);
        }
    };
}

// create 2 FBOs so one pixel processing can be done in-place
function create_double_fbo (gl, w, h, internalFormat, format, type, param, depth) {
    let fbo1 = create_fbo(gl, w, h, internalFormat, format, type, param, depth);
    let fbo2 = create_fbo(gl, w, h, internalFormat, format, type, param, depth);

    let texel_x = 1.0 / w;
    let texel_y = 1.0 / h;

    return {
        width: w,
        height: h,
        single: false, // double fbo
        texel_x,
        texel_y,
        get read() {
            // getter for fbo1
            return fbo1;
        },
        set read(value) {
            fbo1 = value;
        },
        get write() {
            // getter for fbo2
            return fbo2;
        },
        set write(value) {
            fbo2 = value;
        },
        swap() {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    }
}