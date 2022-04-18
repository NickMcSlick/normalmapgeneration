// computes v_coord here; no need to receive texcoord array as attribute variable
const vertex_display = `#version 300 es
	in vec2 a_position;	
	out vec2 v_coord;

	void main() {	   
	   gl_PointSize = 1.0;
	   gl_Position = vec4(a_position, 0.0, 1.0); // 4 corner vertices of quad

	   v_coord = a_position * 0.5 + 0.5; // UV coords: (0, 0), (0, 1), (1, 1), (1, 0)
	}
`;

const frag_display = `#version 300 es
	precision mediump float;
	precision highp sampler2D;

	uniform sampler2D u_image;
	in vec2 v_coord;

	out vec4 cg_FragColor; 

	void main() {
	   cg_FragColor = texture(u_image, v_coord);
	}
`;

const frag_gauss = `#version 300 es
    precision highp float; 
    precision highp sampler2D;
    
    uniform vec2 u_texel; // added by hk
    uniform sampler2D u_image;
    uniform float u_half; // kernel half width
    in vec2 v_coord;
    out vec4 cg_FragColor;
        
    void main () {
        float x = v_coord.x;
        float y = v_coord.y;
        float dx = u_texel.x;
        float dy = u_texel.y;        

		float sigma = u_half; 
        float twoSigma2 = 2.0 * sigma * sigma;
        vec4 sum = vec4(0.0, 0.0, 0.0, 0.0);
        float w_sum = 0.0;
        	
        for (float j = -u_half; j <= u_half; j+=1.0) {	
			for (float i = -u_half; i <= u_half; i+=1.0) {	
			    float d = distance(vec2(0.0), vec2(i, j));
			    if (d > u_half) continue;		
				float weight = exp(-d * d / twoSigma2);
				vec4 st = texture(u_image, vec2(x+dx*i, y+dy*j));
				sum += weight * st; // sum is float4
				w_sum += weight;
			}
        }		
		
		sum /= w_sum; // normalize weight
		                
	    cg_FragColor = sum; 
    }
`;

// assuming grayscale input image
const frag_sobel = `#version 300 es
	precision highp float; 
    precision highp sampler2D;
    
    in vec2 v_coord;
    uniform sampler2D u_image;
    uniform vec2 u_texel; // added by hk
    uniform float u_scale;
	uniform float u_normal_height;
	uniform bool u_swap_direction;

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

const frag_gray = `#version 300 es
	precision highp float;
	precision highp sampler2D;

	uniform sampler2D u_image;
	in vec2 v_coord;
	out vec4 cg_FragColor;

	void main() {
	   vec4 c = texture(u_image, v_coord); // [0, 1]
	   float g = (c.r + c.g + c.g) / 3.0; // [0, 1]
	   cg_FragColor = vec4(g, g, g, 1.0);
	}
`;

const frag_gradient_2_mag = `#version 300 es	
    precision highp float; 
    precision highp sampler2D;

    in vec2 v_coord;
    uniform sampler2D u_gradient; // gradient 

    out vec4 cg_FragColor;
	 
    void main() {     	        

        vec4 g = texture(u_gradient, v_coord);
		                
	    cg_FragColor = vec4(g.a, g.a, g.a, 1.0);	    	    
    } 
`;

const frag_nonmaxima_suppression = `#version 300 es
    precision highp float; 
    precision highp sampler2D;
    
    uniform vec2 u_texel; 
    uniform sampler2D u_gradient;
    uniform sampler2D u_mag;
    uniform float u_thres;

    in vec2 v_coord;
    out vec4 cg_FragColor;
        
    void main () {
        float m = texture(u_mag, v_coord).r;
        vec2 g = texture(u_gradient, v_coord).xy;
        g = (g * 2.0) - 1.0; // [-1, 1]
        vec2 coord_1 = v_coord + g * u_texel;
        vec2 coord_2 = v_coord - g * u_texel;
        float m1 = texture(u_mag, coord_1).r;
        float m2 = texture(u_mag, coord_2).r;

        vec4 cout = vec4(1.0);

        if (m > m1 && m > m2 && m > u_thres)
            cout = vec4(0.0, 0.0, 0.0, 1.0); // maximum - black
        
        cg_FragColor = cout;
        //cg_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
    }
`;

const frag_dilation = `#version 300 es
    precision highp float; 
    precision highp sampler2D;

    in highp vec2 v_coord;
    uniform vec2 u_texel; 
    uniform sampler2D u_image;
    uniform float u_radius;
    
    out vec4 cg_FragColor;
        
    void main () {
        float x = v_coord.x;
        float y = v_coord.y;
        float dx = u_texel.x;
        float dy = u_texel.y;        

		//vec4 cout = vec4(0.0);
		//vec4 cout = vec4(1.0);
		vec4 cout = vec4(1.0, 1.0, 1.0, 0.0); // alpha = 0.0
        		
        for (float s = -u_radius; s <= u_radius; s+=1.0) {
        	for (float t = -u_radius; t <= u_radius; t+=1.0) {
				vec4 c = texture(u_image, vec2(x+dx*s, y+dy*t));
				if (c.r < 0.5) { // black pixel found
					float d = sqrt(s*s + t*t);
					if (d <= u_radius) cout = c;
				}
        	}
		}			
               
	    cg_FragColor = cout;
    }
`;

const frag_blend_src_alpha = `#version 300 es
	precision mediump float;
	precision highp sampler2D;

	in vec2 v_coord;

	uniform sampler2D u_src;
	uniform sampler2D u_dst;

	out vec4 cg_FragColor;
	
	void main() {
		vec4 s = texture(u_src, v_coord);
		vec4 d = texture(u_dst, v_coord);
		float alpha = s.a;
		vec3 c = alpha * s.rgb + (1.0 - alpha) * d.rgb;

		cg_FragColor = vec4(c, 1.0);
	}
`;

let gl, canvas;
let vao_obj = null; // vertex array object for obj
let g_texture = [];
let g_image = [];
let g_anim_id;
let g_prog = []; // shader programs
let out_depth;
let out;
let toon;
let gradient;
let mag;
let canny;
let vao_image; // vao for drawing image (using 2 triangles)
let prog_display;
let prog_gauss;
let prog_gray;
let prog_sobel;
let prog_gradient_2_mag;
let prog_dilation;
let prog_toon;
let prog_gouraud;
let prog_blend_src_alpha;

function render(img) { 
	console.log(img);
    vao_image_create();     
	cg_init_framebuffers(img);
	
    // Set the clear color and enable the depth test
    gl.clearColor(0.8, 0.8, 0.8, 1.0);
    gl.enable(gl.DEPTH_TEST);
    cancelAnimationFrame(g_anim_id); // to avoid duplicate requests

    // the first few iterations of update() may display nothing because
    // Ajax requests for .obj and .mtl may not have been returned yet! 
    var update = function() {

        if (img) { // vao defined
            render_initial_img(0, img, out);
            //gauss(out, 1.0); // default: 1.5
            gray(out);
            sobel(out, gradient, 50, 0.6, true); // normalized gradient
            gradient_2_mag(gradient, mag); 
			//gauss(gradient, 1.0);
            render_null(gradient);

			document.getElementById("download").onclick = downloadCanvas;

			function downloadCanvas(){  
			    // get canvas data  
			    var image = canvas.toDataURL("image/png");  
			  
			    // create temporary link  
			    var tmpLink = document.createElement( 'a' );  
			    tmpLink.download = 'image.png'; // set the name of the download file 
			    tmpLink.href = image;  
			  
			    // temporarily add link to body and initiate the download  
			    document.body.appendChild( tmpLink );  
			    tmpLink.click();  
			    document.body.removeChild( tmpLink );  
			}
        }
        
        g_anim_id = requestAnimationFrame(update);
    };
    update();
}

function render_img (src, dst) {
    let program = prog_display;
    program.bind();

    if (src.single) gl.uniform1i(program.uniforms.u_image, src.attach(8));
    else gl.uniform1i(program.uniforms.u_image, src.read.attach(8));
    
    //gl.viewport(0, 0, src.width, src.height);
    gl.viewport(0, 0, dst.width, dst.height);
 
    if (dst.single) draw_vao_image(dst.fbo);
    else {
        draw_vao_image(dst.write.fbo);
        dst.swap();
    }  
}

function render_initial_img (id, img, dst) {
    let program = prog_display;
    program.bind();

    gl.uniform1i(program.uniforms.u_image, 0);
 
    gl.viewport(0, 0, img.width, img.height);
 
    if (dst.single) draw_vao_image(dst.fbo);
    else {
        draw_vao_image(dst.write.fbo);
        dst.swap();
    }  
}

function cg_init_shaders(gl, vshader, fshader) {
  var program = createProgram(gl, vshader, fshader); // defined in cuon-utils.js

  return program;
}

class GLProgram {
    constructor (vertex_shader, frag_shader) {
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

    bind () {
        gl.useProgram(this.program);
    }
}


function main () {
	let img;
	img = new Image();
	img.crossOrigin = "";
	
	img.width = 512;
	img.height = 512;
	
	console.log(img);
	
	//img.src = "http://www.cs.umsl.edu/~kang/htdocs/textures/mars.jpg";
	//img.src = "http://www.cs.umsl.edu/~kang/htdocs/images/fur.jpg";
	//img.src = "http://www.cs.umsl.edu/~kang/htdocs/images/butterfly.jpg"; 
	//img.src = "http://www.cs.umsl.edu/~kang/htdocs/images/8k_earth_daymap.jpg.jpg"; 
	
	//img.src = "metal.jpg";
	img.src = "fur_diffuse.jpg";
	//img.src = "cs6410hw2test/hw2/images/paper_diffuse.jpg";
    
	// Retrieve <canvas> element
    canvas = document.getElementById('canvas', {preserveDrawingBuffer:true});

    // Get the rendering context for WebGL
    gl = canvas.getContext('webgl2');
	
    prog_display = new GLProgram(vertex_display, frag_display);
    // shader to draw on custom framebuffer
    prog_gauss = new GLProgram(vertex_display, frag_gauss);
    prog_sobel = new GLProgram(vertex_display, frag_sobel);
    prog_gradient_2_mag = new GLProgram(vertex_display, frag_gradient_2_mag);
    prog_nonmaxima_suppression = new GLProgram(vertex_display, frag_nonmaxima_suppression);
    prog_dilation = new GLProgram(vertex_display, frag_dilation);
    prog_blend_src_alpha = new GLProgram(vertex_display, frag_blend_src_alpha);
    prog_gray = new GLProgram(vertex_display, frag_gray);
	
	img.onload = function() { 
	 texture_setup(0);
	 canvas.width = img.width;
	 canvas.height = img.height;
	gl = canvas.getContext('webgl2');
	function texture_setup(i) {
	  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); // Flip the image's y axis
	  gl.activeTexture(gl.TEXTURE0 + i);
	  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());

	  // Set the parameters so we can render any size image.
	  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

	  // Upload the image into the texture.
	  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
	}
	
		render(img) 
	};

	let gui = new dat.GUI();
	
}

// Create a buffer object, assign it to attribute variables, and enable the assignment
function create_empty_buffer_object (a_attribute, num, type) {
    
    var buffer = gl.createBuffer();
    // Create a buffer object

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(a_attribute, num, type, false, 0, 0);
    // Assign the buffer object to the attribute variable
    gl.enableVertexAttribArray(a_attribute);
    // Enable the assignment

    return buffer;
}

function cg_init_framebuffers(img) {
    console.log("Image width: " + img.width);
    console.log("Image height: " + img.height);

    gl.getExtension('EXT_color_buffer_float');
    // enables float framebuffer color attachment

    out_depth = create_double_fbo(canvas.width, canvas.height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, true);
    toon = create_double_fbo(canvas.width, canvas.height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, false);
    outline = create_double_fbo(canvas.width, canvas.height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, false);
    out = create_double_fbo(canvas.width, canvas.height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, false);
    gradient = create_double_fbo(canvas.width, canvas.height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, false);
    mag = create_double_fbo(canvas.width, canvas.height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, false);
    canny = create_double_fbo(canvas.width, canvas.height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, false);
}

// When attaching a texture to a framebuffer, all rendering commands will 
// write to the texture as if it was a normal color/depth or stencil buffer.
// The advantage of using textures is that the result of all rendering operations
// will be stored as a texture image that we can then easily used in shaders
function create_fbo (w, h, internalFormat, format, type, param, depth) {

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
function create_double_fbo (w, h, internalFormat, format, type, param, depth) {
    let fbo1 = create_fbo(w, h, internalFormat, format, type, param, depth);
    let fbo2 = create_fbo(w, h, internalFormat, format, type, param, depth);

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

// using glsl 300
function gauss (dst, half) {
    let program = prog_gauss;
    program.bind();
    // drawProgram is now current vertex/fragment shader pair

    if (dst.single) gl.uniform1i(program.uniforms.u_image, dst.attach(8));
    else gl.uniform1i(program.uniforms.u_image, dst.read.attach(8));
    
    gl.uniform2f(program.uniforms.u_texel, dst.texel_x, dst.texel_y);
    gl.uniform1f(program.uniforms.u_half, half);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    if (dst.single) draw_vao_image(dst.fbo);
    else {
        draw_vao_image(dst.write.fbo);
        dst.swap();
    }
}

function sobel (src, dst, scale, normalHeight, swap) {
    let program = prog_sobel;
    program.bind();

    gl.uniform1i(program.uniforms.u_image, src.read.attach(1));
    gl.uniform2f(program.uniforms.u_texel, src.texel_x, src.texel_y);
    gl.uniform1f(program.uniforms.u_scale, scale);
	gl.uniform1f(program.uniforms.u_normal_height, normalHeight);
	gl.uniform1f(program.uniforms.u_swap_direction, swap);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    draw_vao_image(dst.write.fbo);
   
    dst.swap();
}

// using glsl 300
function gray (dst) {
    let program = prog_gray;
    program.bind();
    // drawProgram is now current vertex/fragment shader pair

    if (dst.single) gl.uniform1i(program.uniforms.u_image, dst.attach(8));
    else gl.uniform1i(program.uniforms.u_image, dst.read.attach(8));
    
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    if (dst.single) draw_vao_image(dst.fbo);
    else {
        draw_vao_image(dst.write.fbo);
        dst.swap();
    }
}

// use vao to avoid resending data to gpu in each frame
function render_img (src, dst) {
    let program = prog_display;
    program.bind();

    if (src.single) gl.uniform1i(program.uniforms.u_image, src.attach(8));
    else gl.uniform1i(program.uniforms.u_image, src.read.attach(8));
    
    //gl.viewport(0, 0, src.width, src.height);
    gl.viewport(0, 0, dst.width, dst.height);
 
    if (dst.single) draw_vao_image(dst.fbo);
    else {
        draw_vao_image(dst.write.fbo);
        dst.swap();
    }  
}

// render to default framebuffer
function render_null (src) {
    let program = prog_display;
    program.bind();

    if (src.single) gl.uniform1i(program.uniforms.u_image, src.attach(8));
    else gl.uniform1i(program.uniforms.u_image, src.read.attach(8));
    
    gl.viewport(0, 0, canvas.width, canvas.height);

    draw_vao_image(null);
}

function render_null_img(img) {
	let program = prog_display;
    program.bind();

    gl.uniform1i(program.uniforms.u_image, 0)
    
    gl.viewport(0, 0, canvas.width, canvas.height);

    draw_vao_image(null);
}


function draw_vao_image (fbo) {
    // bind destination fbo to gl.FRAMEBUFFER
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    // start recording bindBuffer or vertexAttribPointer
  	gl.bindVertexArray(vao_image);
    
    // draw trangles using 6 indices
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.bindVertexArray(null); // unbind
}

function vao_image_create () {
	// create vao for 2 triangles 
    vao_image = gl.createVertexArray();
    // start recording bindBuffer or vertexAttribPointer
  	gl.bindVertexArray(vao_image);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    // we have 4 vertices, forming a 2x2 square
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    // 0 is a reference to attribute variable 'a_position' in shader

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    // note that we have 6 indices in total (3 for each triangle, or half of square)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    // 2 means (x, y)
    
    gl.bindVertexArray(null); // stop recording
}

// read framebuffer content from target.fbo then put it in 1d texture array
function framebufferToTexture (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    let length = target.width * target.height * 4;
    // texture is one dimensional array to hold captured image data in CPU memory
    let texture = new Float32Array(length);

    // capture framebuffer (screen) and move image data into CPU memory (texture)
    // gl.readPixels always reads from currently bound framebuffer
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, texture);
    //gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.HALF_FLOAT, texture);
    return texture;
}

// from gradient image, extract gradient magnitude only
function gradient_2_mag (gradient, mag) {
    let program = prog_gradient_2_mag;
    program.bind();

    gl.uniform1i(program.uniforms.u_gradient, gradient.read.attach(1)); 
    
    gl.viewport(0, 0, mag.width, mag.height);

    draw_vao_image(mag.write.fbo);
 
    mag.swap();
}

function nonmaxima_suppression(gradient, mag, canny, thres) {
    let program = prog_nonmaxima_suppression;
    program.bind();

    gl.uniform1i(program.uniforms.u_gradient, gradient.read.attach(1));
    gl.uniform1i(program.uniforms.u_mag, mag.read.attach(2));
    gl.uniform2f(program.uniforms.u_texel, mag.texel_x, mag.texel_y);
    gl.uniform1f(program.uniforms.u_thres, thres);

    gl.viewport(0, 0, canny.width, canny.height);

    if (canny.single)
        draw_vao_image(canny.fbo);
    else {
        draw_vao_image(canny.write.fbo);
        canny.swap();
    }
}

// Note: dilation cannot be applied to single FBO because it will cause 
// Feedback loop formed between Framebuffer and active Texture.
function dilation(src, dst, radius) {
    let program = prog_dilation;
    program.bind();

    if (src.single)
        gl.uniform1i(program.uniforms.u_image, src.attach(1));
    else
        gl.uniform1i(program.uniforms.u_image, src.read.attach(1));

    gl.uniform2f(program.uniforms.u_texel, src.texel_x, src.texel_y);
    gl.uniform1f(program.uniforms.u_radius, radius);

    gl.viewport(0, 0, dst.width, dst.height);

    if (dst.single)
        draw_vao_image(dst.fbo);
    else {
        draw_vao_image(dst.write.fbo);
        dst.swap();
    }
}

// blend double FBO (src) on top of double FBO (dst)
// use src.alpha in each pixel
function blend_src_alpha (src, dst, out) {
    let program = prog_blend_src_alpha;
    program.bind();

    if (src.single) gl.uniform1i(program.uniforms.u_src, src.attach(1));
    else gl.uniform1i(program.uniforms.u_src, src.read.attach(1));

    if (dst.single) gl.uniform1i(program.uniforms.u_dst, dst.attach(2));
    else gl.uniform1i(program.uniforms.u_dst, dst.read.attach(2));

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    if (out.single) draw_vao_image(out.fbo);
    else {
        draw_vao_image(out.write.fbo);
        out.swap();
    }
}