const debug = require('debug')('http:debug')
	, info = require('debug')('http:info')
	, express = require('express')
	, app = express()
	, bodyParser = require('body-parser') 
	, engine = require('express-ejs-layouts')
	, server = require('http').createServer(app)
	, io = require('socket.io').listen(server)
	, fs = require('fs');

/* Setting to use socket.io */
app.server = server;
app.io = io;

/* Setup ejs template engine */
app.set('view engine', 'ejs');
app.set('views', __dirname + '/webui');
app.set('layout', 'layout');

/* always using ejs-layout module */
app.use(engine);

/* Use request body parser */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

/* Define Static Files Path */
app.use('/images', express.static(__dirname + '/webui/images'));
app.use('/script', express.static(__dirname + '/webui/script'));
app.use('/style', express.static(__dirname + '/webui/style'));

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

app.get('/start-plugin', function(req, res) {
	process.send({ command: 'start-plugin' });

	res.status(200).end();
});

app.get('/stop-plugin', function(req, res) {
	process.send({ command: 'stop-plugin' });

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

var port = Number(process.argv[2]);
server.listen(port, function() {
	info("Http server listening on port %d", port);
});