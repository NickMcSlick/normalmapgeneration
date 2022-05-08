// CS6410 Final Project 4/18/22 Bryce Paubel
// This project takes in multiple local images and uses FBOs
// and a variation of Sobel Masking to generate a normal map

// This algorithm works particularly well for images that have few colors
// For example, the wood texture works quite well
// It is of course not ideal, since it isn't a 'proper' way to generate normal maps
// However, it does work, and in many cases it works well

/* NOTE - many of these shaders are based off of HW3, since this normal mapping algorithm is similar to our edge detector */

// Image display vertex shader
const vertexImgDisplay = `#version 300 es
	in vec2 a_Position;   // Positions
	out vec2 v_TexCoord;  // Texture coords

	void main() {
		// Set the position
		gl_Position = vec4(a_Position, 0.0, 1.0);

		// Similar to HW3, I decided to convert
		// the position coordinates into texture coordinates
		// in order to simplify the VAO
		v_TexCoord = a_Position * 0.5 + 0.5;
	}
`;

// Image display fragment shader
const fragImgDisplay = `#version 300 es
	precision mediump float;
	precision highp sampler2D;

	uniform sampler2D u_Image; 	// Input image
	in vec2 v_TexCoord; 	    // Input texture coordinates
	out vec4 cg_FragColor;      // Output color

	// Get and display color from texture
	void main() {
	   cg_FragColor = texture(u_Image, v_TexCoord);
	}
`;

// Gauss shader
// Based off of HW3
const fragGauss = `#version 300 es
    precision highp float; 
    precision highp sampler2D;
    
    uniform vec2 u_Texel; // added by hk
    uniform sampler2D u_Image;
    uniform float u_Half; // kernel half width
    in vec2 v_TexCoord;
    out vec4 cg_FragColor;
        
    void main () {
        float x = v_TexCoord.x;
        float y = v_TexCoord.y;
        float dx = u_Texel.x;
        float dy = u_Texel.y;        

		float sigma = u_Half; 
        float twoSigma2 = 2.0 * sigma * sigma;
        vec4 sum = vec4(0.0, 0.0, 0.0, 0.0);
        float w_sum = 0.0;

	    for (float j = -u_Half; j <= u_Half; j+=1.0) {	
			for (float i = -u_Half; i <= u_Half; i+=1.0) {	
				float d = distance(vec2(0.0), vec2(i, j));
				if (d > u_Half) continue;		
				float weight = exp(-d * d / twoSigma2);
				vec4 st = texture(u_Image, vec2(x+dx*i, y+dy*j));
				sum += weight * st; // sum is float4
				w_sum += weight;
			}
		}
		
		sum /= w_sum; // normalize weight
		cg_FragColor = sum;	
    }
`;

// Normal map generator using sobel masking

// This is the major part of the project
// It essentially takes the ideas of our sobel mask shader from HW3
// and then applies them to normal mapping - there are some similar operations
// from HW3, like normalizing values (which is necessary) but there are major
// needed to get proper normals
const fragSobelNormalGeneration = `#version 300 es
	precision highp float; 
    precision highp sampler2D;

    in vec2 v_TexCoord;            // Texture coordinates from fragment shader

    uniform sampler2D u_Image; 	   // Image ID
    uniform vec2 u_Texel; 	       // Texel lengths
    uniform float u_Scale;   	   // The scaling for the gradient magnitude
	uniform float u_NormalHeight;  // The height for the normal (assuming the height is constant)
	uniform bool u_SwapDirection;  // Swap the direction of the gradient

    out vec4 cg_FragColor;         // Output color

	// Sobel operator, which returns gradient
	// Note that this doesn't assume a grayscale image,
	// so it makes any textures needed grayscale in its computation
	vec2 sobel(vec2 coord, vec2 texel) {
		vec2 gradient = vec2(0.0);

		// Get lower left corner value
		vec3 color1 = texture(u_Image, vec2(coord.x - texel.x, coord.y - texel.y)).rgb;
		float lowerLeft = (color1.r + color1.g + color1.b) / 3.0;

		// Get left value
		vec3 color2 = texture(u_Image, vec2(coord.x - texel.x, coord.y)).rgb;
		float left = (color2.r + color2.g + color2.b) / 3.0;

		// Get upper left corner value
		vec3 color3 = texture(u_Image, vec2(coord.x - texel.x, coord.y + texel.y)).rgb;
		float upperLeft = (color3.r + color3.g + color3.b) / 3.0;

		// Get lower right corner value
		vec3 color4 = texture(u_Image, vec2(coord.x + texel.x, coord.y - texel.y)).rgb;
		float lowerRight = (color4.r + color4.g + color4.b) / 3.0;

		// Get right value
		vec3 color5 = texture(u_Image, vec2(coord.x + texel.x, coord.y)).rgb;
		float right = (color5.r + color5.g + color5.b) / 3.0;

		// Get upper right value
		vec3 color6 = texture(u_Image, vec2(coord.x + texel.x, coord.y + texel.y)).rgb;
		float upperRight = (color6.r + color6.g + color5.b) / 3.0;

		// Get upper value
		vec3 color7 = texture(u_Image, vec2(coord.x, coord.y + texel.y)).rgb;
		float upper = (color7.r + color7.g + color7.b) / 3.0;

		// Get lower value
		vec3 color8 = texture(u_Image, vec2(coord.x, coord.y - texel.y)).rgb;
		float lower = (color8.r + color8.g + color8.b) / 3.0;

		// Compute the sobel gradient
		gradient = vec2(
			-lowerLeft - 2.0 * left - upperLeft + lowerRight + 2.0 * right + upperRight,
			-lowerLeft - 2.0 * lower - lowerRight + upperLeft + 2.0 * upper + upperRight
		);

		gradient.x /= 4.0;
		gradient.y /= 4.0;

		return gradient;
	}

    void main () {   
		// Get the gradient from the sobel operator
        vec2 gradient = sobel(v_TexCoord, u_Texel);

		// Find and normalize the magnitude to [0, 1]
		float magnitude = gradient.x * gradient.x + gradient.y * gradient.y;
	    magnitude /= 2.0; 	   

        // Zero gradients are turned into vertical tangents
        if (gradient.x == 0.0 && gradient.y == 0.0) gradient = vec2(1.0, 0.0); 

		// Sometimes a texture needs its normals in the opposite direction of the gradient
		if (u_SwapDirection) {
			gradient.x = -gradient.x;
			gradient.y = -gradient.y;
		}

		// Normalize the gradient into [0, 1] (for rgb)
	    gradient = normalize(gradient);
	    gradient = (gradient + 1.0) / 2.0;

		// Use tanh to enhance the magnitude
	    magnitude = tanh(u_Scale * magnitude);	

		/////////////////////////////////////////////////////////////
	    // To help avoid noise, the mix function is used
		// We use 1.0 - mag as the mixing factor, and we mix between
		// the gradient and the neutral normal (with some assumptions made for z)
		// This way, only very strong gradients create drastic normals
		//////////////////////////////////////////////////////////////

		// We assume a constant z-height, as this produces the best results
		cg_FragColor = mix(vec4(gradient, u_NormalHeight, 1.0), vec4(0.5, 0.5, 1.0, 1.0), 1.0 - magnitude);	

    }       
`;



// Image urls
let imgUrls = [
	"../img/earth.jpg",
	"../img/mars.jpg",
	"../img/wood.jpg",
	"../img/rock.jpg",
	"../img/plastic.jpg",
	"../img/metal.jpg",
	"../img/fabric.jpg"
]

// Holds the image objects
let imgs = [];

// The texture objects used for the diffuse and normal maps
let texturesDiffuse = [];
let texturesNormal = [];

// Canvas variables, contexts, programs, VAOs, and animation ID
let diffuseCanvas, normalCanvas;
let glDiffuse, glNormal;
let diffuseProg, normalProg;
let vaoImageDiffuse, vaoImageNormal;
let animID = 0;

// Config object
config = {
	TEXTURE: 0,
	SWAP_DIRECTION: false,
	SCALE: 50,
	Z_HEIGHT: 0.8,
	PREGAUSS: 0.0,
	POSTGAUSS: 0.0,
}


// Main program
function main() {

	// Flags for image downloads
	let downloadDiffuseFlag = false;
	let downloadNormalFlag = false;

	// Get the download buttons and set their onclicks to change their respective flags
	document.getElementById("downloadDiffuse").onclick = function() {
		downloadDiffuseFlag = true;
	}
	document.getElementById("downloadNormal").onclick = function() {
		downloadNormalFlag = true;
	}

	// NOTE THAT THERE WILL BE TWO CONTEXTS HERE
	// ONE FOR THE DIFFUSE DRAWING, AND ONE FOR THE NORMAL MAP DRAWING
	
	// Get canvas elements
	diffuseCanvas = document.getElementById("diffuseCanvas");
	normalCanvas = document.getElementById("normalCanvas");
	
	// Height here is hardcoded, just so that the texture sizes are uniform
	// This could be changed - however, it is done for both aesthetics
	// and ease of FBO creation
	diffuseCanvas.width = normalCanvas.width = 512;
	diffuseCanvas.height = normalCanvas.height = 512;

	// Get context for each element
	glDiffuse = diffuseCanvas.getContext("webgl2");
	glNormal = normalCanvas.getContext("webgl2");

	// For as many URLs as we have, insert objects that are not ready
	// These dummy objects let the program know that the images aren't loaded,
	// even if they haven't been inserted yet
	for (let i = 0; i < imgUrls.length; i++) {
		imgs.push( { ready: false } );
	}

	// Load and setup each image for both contexts
	loadAndSetupImages(imgUrls, glDiffuse, glNormal);

	// Set up programs using the GLProgram data structure from class
	diffuseProg = new GLProgram(vertexImgDisplay, fragImgDisplay, glDiffuse);
	imgProg = new GLProgram(vertexImgDisplay, fragImgDisplay, glNormal);
	normalProg = new GLProgram(vertexImgDisplay, fragSobelNormalGeneration, glNormal);
	gaussProg = new GLProgram(vertexImgDisplay, fragGauss, glNormal);

	// Create VAOs for the image drawing
	vaoImageDiffuse = createImageVao(glDiffuse);
	vaoImageNormal = createImageVao(glNormal);

	// Bind the VAOs (note that these stay bound, since we are doing image processing)
	glDiffuse.bindVertexArray(vaoImageDiffuse);
	glNormal.bindVertexArray(vaoImageNormal);

	// Quick extension needed for FBO
	glNormal.getExtension('EXT_color_buffer_float');

	// Create double FBOs using the data structures from class
	let imgFbo = create_double_fbo(glNormal, 512, 512, glNormal.RGBA16F, glNormal.RGBA, glNormal.HALF_FLOAT, glNormal.LINEAR, false);
	let sobelMaskNormalFbo = create_double_fbo(glNormal, 512, 512, glNormal.RGBA16F, glNormal.RGBA, glNormal.HALF_FLOAT, glNormal.LINEAR, false);

	// The update function
	let update = function() {	
		// Wait until images are loaded
		if (areImagesLoaded(imgs)) {
				// Bind the initial programs
				diffuseProg.bind(glDiffuse);
				imgProg.bind(glNormal);

				// Clear the canvases
				glNormal.clearColor(1.0, 1.0, 1.0, 1.0);
				glNormal.clear(glNormal.COLOR_BUFFER_BIT);
				glDiffuse.clearColor(1.0, 1.0, 1.0, 1.0);
				glDiffuse.clear(glDiffuse.COLOR_BUFFER_BIT);

				// Set each active texture to the appropriate texture
				glDiffuse.activeTexture(glDiffuse.TEXTURE0);
				glDiffuse.bindTexture(glDiffuse.TEXTURE_2D, texturesDiffuse[config.TEXTURE]);
				glDiffuse.uniform1i(diffuseProg.u_Image, 0);
				glNormal.activeTexture(glNormal.TEXTURE0);
				glNormal.bindTexture(glNormal.TEXTURE_2D, texturesNormal[config.TEXTURE]);
				glNormal.uniform1i(normalProg.u_Image, 0);

				// Draw the diffuse map
				glDiffuse.drawElements(glDiffuse.TRIANGLES, 6, glDiffuse.UNSIGNED_SHORT, 0);

				// Draw the texture to an FBO
				renderImgToFbo(glNormal, imgProg, imgFbo, texturesNormal[config.TEXTURE]);

				// If the Gauss value is appropriate, process the FBO with Guassian blurring
				if (config.PREGAUSS > 0.6) {
					gauss(glNormal, gaussProg, imgFbo, config.PREGAUSS);
				}

				// Generate the normal map using sobel masking
				sobelNormalMap(glNormal, normalProg, imgFbo, sobelMaskNormalFbo, config.SCALE, config.Z_HEIGHT, config.SWAP_DIRECTION, config.USE_MAG_HEIGHT);

				// If the Gauss value is appropriate, process the FBO with Guassian blurring
				if (config.POSTGAUSS > 0.6) {			
					gauss(glNormal, gaussProg, sobelMaskNormalFbo, config.POSTGAUSS);	
				}

				// Draw the result to the screen
				renderToScreen(glNormal, imgProg, sobelMaskNormalFbo);

				// If the user wants to download the normal of the diffuse, download it
				if (downloadDiffuseFlag) {
					downloadDiffuseFlag = false;
					let tempLink = document.createElement("a");
					tempLink.setAttribute("download", "diffuse");
					tempLink.setAttribute("href", diffuseCanvas.toDataURL());
					tempLink.click();
				}

				if (downloadNormalFlag) {
					downloadNormalFlag = false;
					let tempLink = document.createElement("a");
					tempLink.setAttribute("download", "normal");
					tempLink.setAttribute("href", normalCanvas.toDataURL());
					tempLink.click();
				}
			}

		// Request another animation frame
		cancelAnimationFrame(animID);
		animID = requestAnimationFrame(update);
	}

	update();

	// Add dat.GUI elements
    let gui = new dat.GUI( { width: 230 } );
    gui.add(config, "TEXTURE", { "Earth": 0, "Mars": 1, "Wood": 2 , "Rock": 3, "Plastic": 4, "Metal": 5, "Fabric": 6 }).name("Texture Pair").onFinishChange(update);
    gui.add(config, "SWAP_DIRECTION").name("Reverse Normal").onFinishChange(update);
    gui.add(config, "SCALE", 1, 300).name("Normal Intensity").onFinishChange(update);
	gui.add(config, "Z_HEIGHT", 0, 1).name("Z-Height").onFinishChange(update);
	gui.add(config, "PREGAUSS", 0.0, 10).name("Pre-Gauss").onFinishChange(update);
	gui.add(config, "POSTGAUSS", 0.0, 10).name("Post-Gauss").onFinishChange(update);
}

// Load and set up the images
function loadAndSetupImages(imageUrls, gl1, gl2) {
	for (let i = 0; i < imageUrls.length; i++) {
		// Create a new image
		let img = new Image();
		img.ready = false;      // Image is not ready
		img.src = imageUrls[i];
		img.width = 512;        // Setting up the images to be the same height as the FBO
		img.height = 512;       // Setting up the images to be the same height as the FBO
		img.crossOrigin = "";

		
		img.onload = function() {
			// Set up the images for first context
			let texture1 = gl1.createTexture();
			
			// Store the texture object
			texturesDiffuse[i] = texture1

			gl1.pixelStorei(gl1.UNPACK_FLIP_Y_WEBGL, 1);
			gl1.activeTexture(gl1.TEXTURE0 + i);
			gl1.bindTexture(gl1.TEXTURE_2D, texture1);
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_WRAP_S, gl1.CLAMP_TO_EDGE);
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_WRAP_T, gl1.CLAMP_TO_EDGE);
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_MIN_FILTER, gl1.LINEAR);
			gl1.texParameteri(gl1.TEXTURE_2D, gl1.TEXTURE_MAG_FILTER, gl1.LINEAR);
			gl1.texImage2D(gl1.TEXTURE_2D, 0, gl1.RGBA, gl1.RGBA, gl1.UNSIGNED_BYTE, img);
			
			// Set up the images for second context
			let texture2 = gl2.createTexture();

			// Store the texture object
			texturesNormal[i] = texture2;
			
			gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, 1);
			gl2.activeTexture(gl2.TEXTURE0 + i);
			gl2.bindTexture(gl2.TEXTURE_2D, texture2);
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
			gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
			gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, img);

			console.log("loaded image " + i);
			
			// New attribute for the image to determine if it has been loaded
			img.ready = true;

			// Store the image object in the images array
			imgs[i] = img;
		}
		
	}
}


// Check if images are loaded
function areImagesLoaded(images) {
	for (let i = 0; i < images.length; i++) {
		if (!images[i].ready || !images[i].complete || images[i].naturalHeight === 0)
			return false;
	}
	return true;
}

/* For my FBO and VAO functions, I tried to follow similar standards to HW3 */
/* VERY IMPORTANT NOTE - THESE DRAWING FUNCTIONS ASSUME DOUBLE FBOS */

// Create a VAO specifically for images
function createImageVao(gl) {
	// Create a VAO
	vaoImage = gl.createVertexArray();
  	gl.bindVertexArray(vaoImage);

	// Create and bind the vertex buffer
	let vertexBuffer = gl.createBuffer();
	let vertices = [-1, -1, -1, 1, 1, 1, 1, -1];
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

	// Create and bind the element array buffer
	let elementBuffer = gl.createBuffer();
	let elements = [0, 1, 2, 0, 2, 3];
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(elements), gl.STATIC_DRAW);

	// Unbind the VAO
    gl.bindVertexArray(null);

	// Return the VAO
	return vaoImage;
}

// Gaussian blurring - based on HW3
function gauss(gl, prog, fbo, scale) {
	// Bind the program to the context
    prog.bind(gl);

	// Attach the necessary information from the FBO
    gl.uniform1i(prog.uniforms.u_Image, fbo.read.attach(8));
    gl.uniform2f(prog.uniforms.u_Texel, fbo.read.texel_x, fbo.read.texel_y);
    gl.uniform1f(prog.uniforms.u_Half, scale);

	// Correct the viewport size, bind the buffer, and draw
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.write.fbo);
	gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

	// Swap the fbo
	fbo.swap();
}

// Render to the screen
function renderToScreen(gl, prog, fbo) {
	// Bind the program to the context
	prog.bind(gl);

	// Attach the FBO image and set the framebuffer to be the system
	gl.uniform1i(prog.uniforms.u_Image, fbo.read.attach(8));
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	// Draw to the screen
	gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

	// Swap the FBO
	fbo.swap();
}

// Draw the sobel normal map
function sobelNormalMap(gl, prog, ori, dst, scale, normalHeight, swap, useMagHeight) {
	// Bind the program to the context
    prog.bind(gl);

	// Attach the proper FBO information
    gl.uniform1i(prog.uniforms.u_Image, ori.read.attach(8));
    gl.uniform2f(prog.uniforms.u_Texel, ori.texel_x, ori.texel_y);

	// Scaling for normal intensity
    gl.uniform1f(prog.uniforms.u_Scale, scale);
	// z-height for normals
	gl.uniform1f(prog.uniforms.u_NormalHeight, normalHeight);
	// Swap the direction of the normals
	gl.uniform1f(prog.uniforms.u_SwapDirection, swap);

	// Make sure the viewport is the correct width, bind the framebuffer, and draw
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.bindFramebuffer(gl.FRAMEBUFFER, dst.write.fbo);
	gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

	// Swap the FBOs
	ori.swap();
	dst.swap();
}

// Render an image to an FBO
function renderImgToFbo(gl, prog, fbo, texture) {
    // First bind the program to the context
	prog.bind(gl);

	// Bind the texture for drawing
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.uniform1i(prog.uniforms.u_Image, 0);

	// Bind the frame buffer for drawing
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.write.fbo);
    gl.uniform2f(prog.uniforms.u_Texel, fbo.write.fbo.texel_x, fbo.write.fbo.texel_y);

	// Correct the viewport height for the FBO and draw
	// Note that we are not rebinding and VAOs
	// This is because we use the same VAO throughout the program
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

	// Swap the FBOs in the double FBO
	fbo.swap();
}

/***** WITHIN MY FINAL PROPOSAL I DISCUSSED USING THESE DATA STRUCTURES AND CODE FROM HW3 *****/

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