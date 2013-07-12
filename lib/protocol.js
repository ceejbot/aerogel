var Crazyprotocol = module.exports = {};

Crazyprotocol.Ports =
{
	CONSOLE     : 0x00,
	PARAM       : 0x02,
	COMMANDER   : 0x03,
	LOGGING     : 0x05,
	DEBUGDRIVER : 0x0E,
	LINKCTRL    : 0x0F,
	ALL         : 0xFF,
};

Crazyprotocol.Channels =
{
	TOC:      0,
	SETTINGS: 1,
	LOGDATA:  2,
	PARAM_TOC: 0,
	PARAM_READ: 1,
	PARAM_WRITE: 2,
};

Crazyprotocol.Commands =
{
	CREATE_BLOCK:  0,
	APPEND_BLOCK:  1,
	DELETE_BLOCK:  2,
	START_LOGGING: 3,
	STOP_LOGGING:  4,
	RESET_LOGGING: 5,
	GET_ELEMENT:   0,
	GET_INFO:      1
};
