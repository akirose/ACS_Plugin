const express = require('express')
	, app = express()
	, engine = require('express-ejs-layouts')
	, bodyParser = require('body-parser')
	, fs = require('fs')
	, server = require('http').createServer(app)
	, io = require('socket.io').listen(server);

app.server = server;
app.io = io;

/* Setup ejs template engine */
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.set('layout', 'layout');
app.use(engine);

/* Use request body parser */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

/* Define Static Files Path */
app.use('/images', express.static(__dirname + '/views/images'));
app.use('/script', express.static(__dirname + '/views/script'));
app.use('/style', express.static(__dirname + '/views/style'));

app.get('/', function(req, res) {
	res.render('index');
});

app.get('/read-setup', function(req, res) {
	var stat = fs.statSync('config.json');
	if(stat.isFile()) {
		res.json(fs.readFileSync('config.json', 'utf8'));
	} else {
		res.json({});
	}
});

app.post('/write-setup', function(req, res) {
	fs.writeFileSync('config.json', JSON.stringify(req.body, null, '\t'), 'utf8');

	res.json({response:200});
});

app.get('/run-plugin', function(req, res) {
	app.emit('run-plugin');

	res.status(200).end();
});

app.get('/stop-plugin', function(req, res) {
	app.emit('stop-plugin');

	res.status(200).end();
});

app.get('/monitor', function(req, res) {
	res.render('monitor');
});

io.of('/monitor').on('connection', function(socket) {
	socket.on('get_running_plugin_list', function() {
		app.emit("get-running-plugins", socket.id);
	});

	socket.on('send-plugin', function(plugin_idx, msg) {
		msg.id = socket.id;
		app.emit("send-plugin", plugin_idx, msg);
	});
});

module.exports = app;