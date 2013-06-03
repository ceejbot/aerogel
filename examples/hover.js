var
	Aerogel = require('../index')
	;


var copter = new Aerogel.Copter();

copter.connect('radio://1/2/2MPS')
.then(function()
{
	return copter.takeoff();
})
.then(function()
{
	var t = setTimeout(function()
	{
		copter.land();
		copter.shutdown()
		.then(function(response)
		{
			console.log(response);
			process.exit(0);
		});
	}, 5000);
})
.fail(function(err)
{
	copter.shutdown()
	.then(function(response)
	{
		console.log(response);
		process.exit(1);
	});
})
.done();
