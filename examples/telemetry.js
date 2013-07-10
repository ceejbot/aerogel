var Aerogel = require('../index');

var driver = new Aerogel.CrazyDriver();
var copter = new Aerogel.Copter(driver);
process.on('SIGINT', bail);

console.log('just connecting & sitting to log some telemetry info...');

function bail()
{
	return copter.land()
	.then(function()
	{
		return copter.shutdown();
	})
	.then(function()
	{
		return process.exit(0);
	})
	.fail(function(err)
	{
		console.log(err);
		copter.shutdown();
		return process.exit(0);
	})
	.done();
}


copter.on('ready', function()
{
	console.log('got all telemetry & parameters');

	var params = copter.driver.parameters.all();
	// console.log(params);

	copter.driver.parameters.get('cpu.id0')
	.then(function(value)
	{
		console.log('cpu.id0 ==', value);
		shutdown();
	});
});

function shutdown()
{
	copter.shutdown()
	.then(function(response)
	{
		console.log(response);
		process.exit(0);
	})
	.fail(function(err)
	{
		console.log(err);
		copter.shutdown()
		.then(function(response)
		{
			console.log(response);
			process.exit(1);
		});
	})
	.done();
}

setTimeout(shutdown, 30000);

driver.findCopters()
.then(function(copters)
{
	if (copters.length === 0)
	{
		console.error('No copters found! Is your copter turned on?');
		process.exit(1);
	}

	var uri = copters[0];
	console.log('Using copter at', uri);
	return uri;
})
.then(function(uri)
{
	return copter.connect(uri);
})
.done();
