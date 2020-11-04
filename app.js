var camera, controls, scene, renderer, scene2, camera2;
var pointsObject, planeObject, axisGroup;

var guiData = new function() {
  this.pointSize = 2;
  this.showAxis = true;
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

function initPointCloudLut(cube) {
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

	console.log("size = " + size);
	var particleCount = 6 * size * size - 12 * size - 8;

	var geometry = new THREE.BufferGeometry();

	var positions = [];
	var colors = [];

	var color = new THREE.Color();

	var x, y, z;
	var r, g, b;
	for (var k = 0; k < size; ++k ) {
		for (var j = 0; j < size; ++j ) {
			for (var i = 0; i < size; ++i ) {
				var maxi = Math.max(Math.max(i, j), k);
				var mini = Math.min(Math.min(i, j), k);
				if (maxi == size - 1 || mini == 0) {
					/*
					x = (i / (size - 1) - 0.5) * 256;
					y = (j / (size - 1) - 0.5) * 256;
					z = (k / (size - 1) - 0.5) * 256;
					tokens = lines[c].split(" ");
					r = parseFloat(tokens[0]);
					g = parseFloat(tokens[1]);
					b = parseFloat(tokens[2]);
					*/
					r = i / (size - 1);
					g = j / (size - 1);
					b = k / (size - 1);
					tokens = lines[c].split(" ");
					z = (parseFloat(tokens[0]) - 0.5) * 256;
					y = (parseFloat(tokens[1]) - 0.5) * 256;
					x = (parseFloat(tokens[2]) - 0.5) * 256;
					
					positions.push(x, y, z);
					colors.push(r, g, b);
				}
				++c;
			}
		}
	}

	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );

	geometry.computeBoundingSphere();

	return geometry;
}

function rebuildScene(texture) {
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

function rebuildSceneLut(cube) {
	{
		if (pointsObject !== undefined) {
			scene.remove(pointsObject);
		}
		var geometry = initPointCloudLut(cube);
		var material = new THREE.PointsMaterial( { size: guiData.pointSize, vertexColors: true } );
		pointsObject = new THREE.Points( geometry, material );
		scene.add( pointsObject );
	}

	{
		if (planeObject !== undefined) {
			scene2.remove(planeObject);
		}
	}
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

	// controls

	controls = new OrbitControls( camera, renderer.domElement );

	//controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)

	controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
	controls.dampingFactor = 0.05;

	controls.screenSpacePanning = false;

	controls.minDistance = 100;
	controls.maxDistance = 500;

	controls.maxPolarAngle = 4 * Math.PI / 6;

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
	gui.add(guiData, 'showAxis');

	//

	window.addEventListener( 'resize', onWindowResize, false );

}

Handlers.prototype.userFileChanged = function(userFile) {
	var filename = userFile.files[0];

	if (filename.name.toLowerCase().endsWith(".cube")) {
		var reader = new FileReader();

		reader.onload = function(e) {
			rebuildSceneLut(e.target.result);
		}

		reader.readAsText(filename);
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

function animate() {

	requestAnimationFrame( animate );

	controls.update(); // only required if controls.enableDamping = true, or if controls.autoRotate = true

	if (pointsObject !== undefined) {
		var material = pointsObject.material;
		material.needsUpdate = material.size != guiData.pointSize;
		material.size = guiData.pointSize;
	}

	axisGroup.visible = guiData.showAxis;

	render();

}

function render() {
	renderer.autoClear = true;
	renderer.render( scene, camera );
	renderer.autoClear = false;
	renderer.render( scene2, camera2 );

}
