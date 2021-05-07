var camera, controls, scene, renderer, scene2, camera2;
var pointsObject, planeObject, linesObject, axisGroup, lutInputGroup;
var lutSympa = 1.0;
var lutData, lutType;
var animationCallbacks = [];
var previousCamera = null;
var mayStopDrawing = true;

var guiData = new function() {
  this.pointSize = 2;
  this.lineWidth = 1;
  this.showAxis = true;
  this.showLutInput = false;
  this.sliderSympa = 1.0;
  this.autostopDrawing = true;
}

init();
animate();

function getImageData( image ) {

	var canvas = document.createElement( 'canvas' );
	canvas.width = image.width;
	canvas.height = image.height;

	var context = canvas.getContext( '2d' );
	context.drawImage( image, 0, 0 );

	return context.getImageData( 0, 0, image.width, image.height );

}

function getPixel( imagedata, x, y ) {

	var position = ( x + imagedata.width * y ) * 4
	var data = imagedata.data;
	return {
		r: data[ position ],
		g: data[ position + 1 ],
		b: data[ position + 2 ],
		a: data[ position + 3 ]
	};
}

function initPointCloud(image) {
	var imagedata = getImageData( image );

	var particles = imagedata.width * imagedata.height;

	var geometry = new THREE.BufferGeometry();

	var positions = [];
	var colors = [];

	var color = new THREE.Color();

	var n = 256, n2 = n / 2; // particles spread in the cube

	for ( var i = 0; i < particles; i ++ ) {

		// colors
		var r = imagedata.data[4 * i + 0] / 255.;
		var g = imagedata.data[4 * i + 1] / 255.;
		var b = imagedata.data[4 * i + 2] / 255.;

		// positions
		var x = (r - 0.5) * n;
		var y = (g - 0.5) * n;
		var z = (b - 0.5) * n;

		positions.push( x, y, z );

		color.setRGB(
			r,
			g,
			b,
		);

		colors.push( color.r, color.g, color.b );

	}

	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );

	geometry.computeBoundingSphere();

	return geometry;
}

function initPointCloudLutCube(cube) {
	var rawLines = cube.split("\n");
	var lines = [];
	var l;
	for (var i = 0 ; i < rawLines.length ; ++i) {
		l = rawLines[i];
		if (l.trim().startsWith("#") || l.trim() == "") continue;
		lines.push(l);
	}
	var c = 0;
	var tokens;
	var size = undefined;
	for (; size === undefined && c < lines.length ; ++c) {
		if (lines[c].startsWith("LUT_3D_SIZE")) {
			tokens = lines[c].trim().split(" ");
			size = parseInt(tokens[tokens.length - 1]);
		}
	}

	if (size === undefined) {
		console.logWarning("Could not find LUT_3D_SIZE");
		return;
	}

	var particleCount = 6 * size * size - 12 * size - 8;
	particleCount = size * size * size;
	var positions = new Float32Array(3 * particleCount);
	var colors = new Float32Array(3 * particleCount);

	var u = 0;
	for (var k = 0; k < size; ++k ) {
		for (var j = 0; j < size; ++j ) {
			for (var i = 0; i < size; ++i ) {
				var maxi = Math.max(Math.max(i, j), k);
				var mini = Math.min(Math.min(i, j), k);
				var th = Math.round((1-lutSympa) * size / 2);
				if ((maxi == size - 1 - th && mini > th) || (mini == th && maxi < size - 1 - th))
				{
					colors[3 * u + 0] = i / (size - 1);
					colors[3 * u + 1] = j / (size - 1);
					colors[3 * u + 2] = k / (size - 1);
					tokens = lines[c].split(" ");
					positions[3 * u + 0] = parseFloat(tokens[0]);
					positions[3 * u + 1] = parseFloat(tokens[1]);
					positions[3 * u + 2] = parseFloat(tokens[2]);
					++u;
				}
				++c;
			}
		}
	}

	return {
		positions: positions.slice(0, 3 * u),
		colors: colors.slice(0, 3 * u),
		frameCount: 1,
		size: [0,0],
	}
}

function initPointCloudLutPlan(plan) {
	var pointCount = new Uint32Array(plan, 0, 1);
	var pointData = new Float64Array(plan.slice(4));

	var positions = new Float32Array(3 * pointCount);
	var colors = new Float32Array(3 * pointCount);

	var x, y, z;
	var r, g, b;
	for (var i = 0; i < pointCount; ++i ) {
		colors[3 * i + 0] = pointData[6 * i + 0];
		colors[3 * i + 1] = pointData[6 * i + 1];
		colors[3 * i + 2] = pointData[6 * i + 2];
		positions[3 * i + 0] = pointData[6 * i + 3];
		positions[3 * i + 1] = pointData[6 * i + 4];
		positions[3 * i + 2] = pointData[6 * i + 5];
	}

	return {
		positions: positions,
		colors: colors,
		frameCount: 1,
		size: [0,0],
	}
}

function initPointCloudLutOt(plan) {
	var size = new Uint32Array(plan, 0, 2);
	var pointCount = size[0] * size[1];
	var body = plan.slice(8);
	var frameCount = Math.floor(body.byteLength / (8 * 3 * pointCount));
	var positionDoubles = new Float64Array(body);

	var subsample = 10;
	var reducedPointCount = Math.floor(pointCount / subsample);
	var positions = new Float32Array(3 * reducedPointCount * frameCount);

	for (var f = 0 ; f < frameCount ; ++f) {
		for (var i = 0; i < reducedPointCount; ++i ) {
			var sourceOffset = f * pointCount + subsample * i;
			var destOffset = f * reducedPointCount + i;
			for (var k = 0 ; k < 3 ; ++k) {
				positions[3 * destOffset + k] = positionDoubles[3 * sourceOffset + k];
			}
		}
	}

	return {
		positions: positions,
		colors: positions.slice(),
		frameCount: frameCount,
		size: size,
	}
}

function initPointCloudLut(data, type) {
	var geoData = {
		positions: [],
		colors: [],
		frameCount: 1,
		size: [0,0],
	};

	if (type == 'CUBE') {
		geoData = initPointCloudLutCube(data);
	} else if (type == 'PLAN') {
		geoData = initPointCloudLutPlan(data);
	} else if (type == 'OT') {
		geoData = initPointCloudLutOt(data);
	}

	for (var i = 0 ; i < geoData.positions.length ; ++i) {
		geoData.positions[i] = (geoData.positions[i] - 0.5) * 256;
	}

	{
		var positions = new Float32Array(geoData.positions.length);
		for (var i = 0 ; i < geoData.positions.length ; ++i) {
			positions[i] = (geoData.colors[i] - 0.5) * 256;
		}
		var geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
		var material = new THREE.PointsMaterial( { size: guiData.pointSize, color: 0x88888888, transparent: true, opacity: 0.3, } );
		geometry.computeBoundingSphere();
		var lutInputPoints = new THREE.Points( geometry, material );
		lutInputGroup.add( lutInputPoints );
	}

	var geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( geoData.positions, 3 ) );
	geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( geoData.colors, 3 ) );
	if (geoData.frameCount > 1) {
		geometry.setDrawRange(0, Math.floor(geoData.positions.length / geoData.frameCount / 3));
	}
	geometry.computeBoundingSphere();
	var material = new THREE.PointsMaterial( { size: guiData.pointSize, vertexColors: true } );
	return {
		object: new THREE.Points( geometry, material ),
		animation: function(frame) {
			frame = frame / 10.0;
			geometry.setDrawRange((frame % geoData.frameCount) * geometry.drawRange.count, geometry.drawRange.count);
			geometry.computeBoundingSphere();
			geometry.attributes.position.needsUpdate = true;
		},
		size: geoData.size,
		colors: geoData.colors,
	}
}

function initLineCloudLut(data, type) {
	var geoData = {
		positions: [],
		colors: [],
	};

	if (type == 'CUBE') {
		//geoData = initPointCloudLutCube(data);
	} else if (type == 'PLAN') {
		geoData = initPointCloudLutPlan(data);
	}

	var subsample = 20;
	var pointCount = geoData.positions.length / 3 / subsample;
	var lines = new Float32Array(6 * pointCount);
	var lineColors = new Float32Array(6 * pointCount);
	for (var i = 0 ; i < pointCount ; ++i) {
		for (var k = 0 ; k < 3 ; ++k) {
			var pos = geoData.positions[3 * i * subsample + k];
			var col = geoData.colors[3 * i * subsample + k];
			lines[6 * i + 0 + k] = (pos - 0.5) * 256;
			lines[6 * i + 3 + k] = (col - 0.5) * 256;
			lineColors[6 * i + 0 + k] = pos;
			lineColors[6 * i + 3 + k] = col;
		}
	}

	var geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( lines, 3 ) );
	geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( lineColors, 3 ) );
	geometry.computeBoundingSphere();
	var material = new THREE.LineBasicMaterial( { linewidth: guiData.lineWidth, vertexColors: THREE.VertexColors } );
	return new THREE.LineSegments( geometry, material );
}

function rebuildScene(texture) {
	animationCallbacks = [];

	if (linesObject !== undefined) {
		scene.remove(linesObject);
	}
	{
		if (pointsObject !== undefined) {
			scene.remove(pointsObject);
		}
		var geometry = initPointCloud(texture.image);
		var material = new THREE.PointsMaterial( { size: guiData.pointSize, vertexColors: true } );
		pointsObject = new THREE.Points( geometry, material );
		scene.add( pointsObject );
	}

	{
		if (planeObject !== undefined) {
			scene2.remove(planeObject);
		}
		var quad = new THREE.PlaneBufferGeometry( texture.image.width / texture.image.height, 1.0 );
		var material = new THREE.MeshBasicMaterial( { map: texture } );
		planeObject = new THREE.Mesh(quad, material);
		planeObject.position.x += 0.5;
		planeObject.position.y += 0.5;
		planeObject.scale.x *= 0.5;
		planeObject.scale.y *= 0.5;
		scene2.add( planeObject );
	}
}

function rebuildSceneLut(data, type) {
	animationCallbacks = [];

	//
	scene.remove(lutInputGroup);
	lutInputGroup = new THREE.Group();
	scene.add(lutInputGroup);

	//
	if (linesObject !== undefined) {
		scene.remove(linesObject);
	}
	linesObject = initLineCloudLut(data, type);
	scene.add( linesObject );

	//
	if (pointsObject !== undefined) {
		scene.remove(pointsObject);
	}
	var pc = initPointCloudLut(data, type);
	pointsObject = pc.object;
	animationCallbacks.push(pc.animation);
	scene.add( pointsObject );

	//
	if (planeObject !== undefined) {
		scene2.remove(planeObject);
	}
	if (type == 'OT') {
		var canvas = document.createElement('canvas');
		var W = pc.size[0];
		var H = pc.size[1];
		canvas.width = W;
		canvas.height = H;
		var ctx = canvas.getContext("2d");

		var texture = new CanvasTexture(canvas);
		var quad = new THREE.PlaneBufferGeometry( pc.size[0] / pc.size[1], 1.0 );
		var material = new THREE.MeshBasicMaterial( { map: texture } );
		planeObject = new THREE.Mesh(quad, material);
		planeObject.position.x += 0.5;
		planeObject.position.y += 0.5;
		planeObject.scale.x *= 0.5;
		planeObject.scale.y *= 0.5;
		scene2.add( planeObject );

		var size = new Uint32Array(data, 0, 2);
		var W = size[0];
		var H = size[1];
		var pointCount = W * H;
		var colorDoubles = new Float64Array(data, 8);
		var frameCount = colorDoubles.length / (3 * pointCount);

		var uint8data = new Uint8ClampedArray(4 * pointCount * frameCount);
		for (var i = 0 ; i < frameCount * pointCount ; ++i) {
			for (var k = 0 ; k < 3 ; ++k) {
				uint8data[4 * i + k] = colorDoubles[3 * i + k] * 255;
			}
			uint8data[4 * i + 3] = 255;
		}

		animationCallbacks.push(function(frame) {
			frame = Math.floor(frame / 10);
			frame = frame % frameCount;
			var slice = new Uint8ClampedArray(uint8data.buffer, 4 * pointCount * frame, 4 * pointCount);
			ctx.putImageData(new ImageData(slice, W, H), 0, 0);
			texture.needsUpdate = true;
		});
	}

	lutData = data;
	lutType = type;
}

function setLutSympa(newLutSympa) {
	if (lutSympa == newLutSympa) return;
	lutSympa = newLutSympa;
	rebuildSceneLut(lutData, lutType);
}

function init() {

	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x121212 );
	//scene.fog = new THREE.FogExp2( 0x121212, 0.002 );

	renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	//renderer.toneMapping = THREE.ReinhardToneMapping;
	document.body.appendChild( renderer.domElement );

	var aspect = window.innerWidth / window.innerHeight;

	camera = new THREE.PerspectiveCamera( 60, aspect, 1, 1000 );
	camera.position.set( 400, 200, 0 );


	camera2 = new THREE.OrthographicCamera( - aspect, aspect, 1, - 1, 0, 1 );
	scene2 = new THREE.Scene();

	// Objects

	axisGroup = new THREE.Group();
	for (var i = 0 ; i < 3 ; ++i) {
		var points = [];
		points.push( new THREE.Vector3( -128, -128, -128 ) );
		points.push( new THREE.Vector3( i == 0 ? 128 : -128, i == 1 ? 128 : -128, i == 2 ? 128 : -128 ) );
		var geometry = new THREE.BufferGeometry().setFromPoints( points );

		var material = new THREE.LineDashedMaterial({
			color: [0x7D0633, 0x76BB6C, 0x145374][i],
			linewidth: 3,
			dashSize: 6,
			gapSize: 3,
		});

		var axisObject = new THREE.Line(geometry, material);
		axisObject.computeLineDistances();
		axisGroup.add(axisObject);
	}
	{
		var points = [];
		points.push( new THREE.Vector3( 128, 128, 128 ) );
		points.push( new THREE.Vector3( -128, 128, 128 ) );
		points.push( new THREE.Vector3( 128, 128, 128 ) );
		points.push( new THREE.Vector3( 128, -128, 128 ) );
		points.push( new THREE.Vector3( 128, 128, 128 ) );
		points.push( new THREE.Vector3( 128, 128, -128 ) );

		points.push( new THREE.Vector3( -128, 128, 128 ) );
		points.push( new THREE.Vector3( -128, -128, 128 ) );
		points.push( new THREE.Vector3( 128, -128, 128 ) );
		points.push( new THREE.Vector3( 128, -128, -128 ) );
		points.push( new THREE.Vector3( 128, 128, -128 ) );
		points.push( new THREE.Vector3( -128, 128, -128 ) );

		points.push( new THREE.Vector3( -128, 128, 128 ) );
		points.push( new THREE.Vector3( -128, 128, -128 ) );
		points.push( new THREE.Vector3( 128, -128, 128 ) );
		points.push( new THREE.Vector3( -128, -128, 128 ) );
		points.push( new THREE.Vector3( 128, 128, -128 ) );
		points.push( new THREE.Vector3( 128, -128, -128 ) );
		var geometry = new THREE.BufferGeometry().setFromPoints( points );

		var material = new THREE.LineDashedMaterial({
			color: 0x444444,
			linewidth: 3,
			dashSize: 6,
			gapSize: 3,
		});

		var axisObject = new THREE.LineSegments(geometry, material);
		axisObject.computeLineDistances();
		axisGroup.add(axisObject);
	}
	scene.add(axisGroup);

	lutInputGroup = new THREE.Group();
	scene.add(lutInputGroup);

	// controls

	controls = new OrbitControls( camera, renderer.domElement );

	//controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)

	controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
	controls.dampingFactor = 0.05;

	controls.screenSpacePanning = false;

	controls.minDistance = 100;
	controls.maxDistance = 500;

	controls.maxPolarAngle = 4 * Math.PI / 6;
	controls.addEventListener('start', function() {
		previousCamera = null;
		mayStopDrawing = false;
		animate();
	})
	controls.addEventListener('end', function() {
		if (guiData.autostopDrawing) {
			mayStopDrawing = true;
		}
	})

	// world

	var imgTexture = new THREE.TextureLoader().load(
		"test.jpg",
		//"mountain.png",
		rebuildScene
	);

	// lights

	var light = new THREE.DirectionalLight( 0xffffff );
	light.position.set( 1, 1, 1 );
	scene.add( light );

	var light = new THREE.DirectionalLight( 0x002288 );
	light.position.set( - 1, - 1, - 1 );
	scene.add( light );

	var light = new THREE.AmbientLight( 0x222222 );
	scene.add( light );

	// GUI

	var gui = new dat.GUI();
	gui.add(guiData, 'pointSize', 1, 10);
	gui.add(guiData, 'lineWidth', 1, 10);
	gui.add(guiData, 'showAxis');
	gui.add(guiData, 'showLutInput');
	gui.add(guiData, 'sliderSympa', 0.0, 1.0);
	gui.add(guiData, 'autostopDrawing');

	//

	window.addEventListener( 'resize', onWindowResize, false );

}

Handlers.prototype.userFileChanged = function(userFile) {
	var filename = userFile.files[0];

	if (filename.name.toLowerCase().endsWith(".cube")) {
		var reader = new FileReader();

		reader.onload = function(e) {
			rebuildSceneLut(e.target.result, 'CUBE');
		}

		reader.readAsText(filename);
	} else if (filename.name.toLowerCase().endsWith(".plan")) {
		var reader = new FileReader();

		reader.onload = function(e) {
			rebuildSceneLut(e.target.result, 'PLAN');
		}

		reader.readAsArrayBuffer(filename);
	} else if (filename.name.toLowerCase().endsWith(".ot")) {
		var reader = new FileReader();

		reader.onload = function(e) {
			rebuildSceneLut(e.target.result, 'OT');
		}

		reader.readAsArrayBuffer(filename);
	} else {
		var reader = new FileReader();

		reader.onload = function(e) {
			var img = document.createElement('img');
			img.onload = function(e) {
				var texture = new THREE.Texture( this );
				texture.needsUpdate = true;
				rebuildScene(texture);
			};
			img.src = e.target.result;
		}

		reader.readAsDataURL(filename);
	}
}

function onWindowResize() {

	var aspect = window.innerWidth / window.innerHeight;
	camera.aspect = aspect;
	camera.updateProjectionMatrix();

	camera2.left = -aspect;
	camera2.right = aspect;
	camera2.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );
}

function matrixEquals(a, b, epsilon) {
	var s = 0;
	var n = a.elements.length;
	var d;
	for (var i = 0 ; i < n ; ++i) {
		d = a.elements[i] - b.elements[i];
		s += d * d;
	}
	return s < epsilon * epsilon;
}

var currentFrame = 0;
function animate() {
	if (mayStopDrawing && previousCamera != null && matrixEquals(previousCamera.matrixWorldInverse, camera.matrixWorldInverse, 1e-5)) {
	} else {
		requestAnimationFrame( animate );
	}
	previousCamera = camera.clone();

	controls.update(); // only required if controls.enableDamping = true, or if controls.autoRotate = true

	if (pointsObject !== undefined) {
		var material = pointsObject.material;
		material.needsUpdate = material.size != guiData.pointSize;
		material.size = guiData.pointSize;
	}

	if (linesObject !== undefined) {
		var material = linesObject.material;
		material.needsUpdate = material.linewidth != guiData.lineWidth;
		material.linewidth = guiData.lineWidth;
	}

	axisGroup.visible = guiData.showAxis;
	lutInputGroup.visible = guiData.showLutInput;

	setLutSympa(guiData.sliderSympa);

	for (var i = 0 ; i < animationCallbacks.length ; ++i) {
		animationCallbacks[i](currentFrame);
	}
	++currentFrame;

	render();

}

function render() {
	renderer.autoClear = true;
	renderer.render( scene, camera );
	renderer.autoClear = false;
	renderer.render( scene2, camera2 );
}
