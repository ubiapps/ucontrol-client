var log = require("debug")("sms-index");
var request = require("request");
var _host = "192.168.9.1";
var _baseURL = "http://" + _host + "/";
var _getSMSPath = "goform/goform_get_cmd_process";

var GSM7_Table = new Array( "0040","00A3","0024","00A5","00E8","00E9","00F9","00EC","00F2","00C7","000A","00D8",     
                            "00F8","000D","00C5","00E5","0394","005F","03A6","0393","039B","03A9","03A0","03A8",
                            "03A3","0398","039E","00A0","00C6","00E6","00DF","00C9","0020","0021","0022","0023",   
                            "00A4","0025","0026","0027","0028","0029","002A","002B","002C","002D","002E","002F",
                            "0030","0031","0032","0033","0034","0035","0036","0037","0038","0039","003A","003A",     
                            "003B","003C","003D","003E","003F","00A1","0041","0042","0043","0044","0045","0046",
                            "0047","0048","0049","004A","004B","004C","004D","004E","004F","0050","0051","0052",       
                            "0053","0054","0055","0056","0057","0058","0059","005A","00C4","00D6","00D1","00DC",
                            "00A7","00BF","0061","0062","0063","0064","0065","0066","0067","0068","0069","006A",    
                            "006B","006C","006D","006E","006F","0070","0071","0072","0073","0074","0075","0076",
                            "0077","0078","0079","007A","00E4","00F6","00F1","00FC","00E0","000C","005E","007B",
                            "007D","005C","005B","007E","005D","007C","20AC");
var GSM7_Table_Extend = new Array("007B","007D","005B","005D","007E","005C","20AC","007C");
var GSM7_Table_Turkey = new Array("005E","007B","007D","005C","005B","007E","005D","007C","011E","0130","015E",
                            "00E7","20AC","011F","0131","015F");
                            
var postData = function(params, cb) {
  params._= Date.now();
  request.post(_baseURL + "goform/goform_set_cmd_process", { json: true }, params, function(err, data){
    if (err) {
      cb(err);
    } else {
      cb(null, data.result === "success");      
    }
  });
};
 
var getSMS = function() {
  var options = {    
    url: _baseURL + _getSMSPath,
    method: "POST",
    headers: {
      Host: _host,
      Referer: _referrer      
    },
    body: "cmd=sms_page_data&page=0&data_per_page=10&mem_store=1&tags=12&order_by=order+by+id+desc&_=" + Date.now()
  };
  request(options, function(err, response, body) {
    if (err || (response && response.statusCode !== 200)) {
      var msg = err.message || response.body.message;
      log("failed to get sms: " + msg);
    } else {
      // Got SMS response.
      var smsList = body;
      
    }
  });    
};

var escapeMessage = function(msg) {
  var returnMsg = "";
  for (var i = 0; i < msg.length; i += 4) {
    var temp = msg.substring(i, i+4);
    if(temp == "000D" || temp == "0009" || temp == "0000" || temp == "0003" || temp == "001B") {
      returnMsg += "";
    } else {
      returnMsg += temp;
    }
  }
  
  return returnMsg;
};

var getEncodeType = function(strMessage) {
  var encodeType = "GSM7_default";
  for (var i = 0; i < strMessage.length; i++) {
    var charCode = strMessage.charCodeAt(i).toString(16);
    while (charCode.length != 4){
      charCode = "0" + charCode;
    }
    if (GSM7_Table.indexOf(charCode.toUpperCase()) == -1 && GSM7_Table_Turkey.indexOf(charCode.toUpperCase()) != -1) {
      encodeType = "GSM7_turkey";
    } else if (GSM7_Table.indexOf(charCode.toUpperCase()) == -1 && GSM7_Table_Turkey.indexOf(charCode.toUpperCase()) == -1) {
      encodeType = "UNICODE";
      break;
    }
  }
  return encodeType;
};

var getCurrentTimeString = function() {
  var time = "";
  var d = new Date();
  time += (d.getFullYear() + "").substring(2) + ";";
  time += getTwoDigit((d.getMonth() + 1)) + ";" + getTwoDigit(d.getDate()) + ";" +
          getTwoDigit(d.getHours()) + ";" + getTwoDigit(d.getMinutes()) + ";" + 
          getTwoDigit(d.getSeconds()) + ";";

  if (d.getTimezoneOffset() < 0){
    time += "+" + (0 - d.getTimezoneOffset() / 60);
  } else{
    time += (0 - d.getTimezoneOffset() / 60);
  }
  
  return time;
};

var getTwoDigit = function(num) {
  num += "";
  while (num.length < 2) {
    num = "0" + num;
  }
  return num;
};

var parseMessages = function(data) {
    var message = {};
    message.body = decodeMessage(escapeMessage(data.content));
    var smsTime = data.date.split(",");
    message.date = smsTime[0] + "/" + smsTime[1] + "/" + smsTime[2];
    message.time = smsTime[3] + ":" + smsTime[4] ;
    message.isNew = data.tag == "1"? true : false;
    return message;
};

function encodeMessage(textString) {
  var haut = 0;
  var result = '';
  for ( var i = 0; i < textString.length; i++) {
    var b = textString.charCodeAt(i);
    if (haut != 0) {
      if (0xDC00 <= b && b <= 0xDFFF) {
        result += dec2hex(0x10000 + ((haut - 0xD800) << 10) + (b - 0xDC00));
        haut = 0;
        continue;
      } else {
        haut = 0;
      }
    }
    if (0xD800 <= b && b <= 0xDBFF) {
      haut = b;
    } else {
      cp = dec2hex(b);
      while (cp.length < 4) {
        cp = '0' + cp;
      }
      result += cp;
    }
  }
  return result;
}

function decodeMessage(str) {
  return str.replace(/([A-Fa-f0-9]{1,4})/g, function(matchstr, parens) {
    return hex2char(parens);
  });
}

function dec2hex(textString) {
  return (textString + 0).toString(16).toUpperCase();
}

function hex2char(hex) {
  var result = '';
  var n = parseInt(hex, 16);
  if (n <= 0xFFFF) {
    result += String.fromCharCode(n);
  } else if (n <= 0x10FFFF) {
    n -= 0x10000;
    result += String.fromCharCode(0xD800 | (n >> 10)) + String.fromCharCode(0xDC00 | (n & 0x3FF));
  }
  return result;
}

var sendSMS = function(toNumber, message, id, cb) {
  var time = getCurrentTimeString();
  var encodedMessage = encodeMessage(message);
  var encodedType = getEncodeType(message);
  postData({ goformId: "SEND_SMS", Number: toNumber, sms_time: time, MessageBody: encodedMessage, ID: id, encode_type: encodedType }, cb);    
};

var deleteSMS = function(id, cb) {
  postData({ goformId: "DELETE_SMS", msg_id: id + ";" }, cb);  
};

var GetSMSMessages = function(nMessageStoreType, nPageNum, nNumberMessagesPerPage, callback) {
  var tag;
  var memStore;
  function  getMsgTime(Msg){
    var MsgTimeArray = Msg.date.split(",");

    /*板侧返回两位数年份，如1999返回99，2012返回12*/
    if(MsgTimeArray[0] < "70"){
        MsgTimeArray[0] = "20" + MsgTimeArray[0];
    }
    var msgTime = new Date(MsgTimeArray[0], MsgTimeArray[1]-1, MsgTimeArray[2], MsgTimeArray[3], MsgTimeArray[4], MsgTimeArray[5]).getTime();
    return  msgTime;
  }

  switch(nMessageStoreType){
    case 1:
    case 5:
      tag = 12;
      break;
    case 2:
    case 6:
      tag = 2;
      break;
    case 3:
    case 7:
      tag = 11;
      break;
    default:
      tag = 10;
      break;
  }

  request.get(_baseURL + "goform/goform_get_cmd_process",
    {
      qs: {
        cmd : "sms_page_data",
        page: nPageNum - 1,
        data_per_page : nNumberMessagesPerPage,
        mem_store : 1,
        tags: tag,
        order_by : "order by id desc"
      },
      json: true,
    },
    function(err, response, body) {
      if (err || !body) {
        cb(err || new Error("invalid response - no body"));
      } else {
        var msgArray = [];
        var messageArray = body.messages;
        
        if (tag === 11) {
          messageArray.sort(function(prevMessage, latterMessage){
            var preMsgTime = getMsgTime(prevMessage);
            var latterMsgTime = getMsgTime(latterMessage);
            if (preMsgTime > latterMsgTime){
                return -1;
            } else if (preMsgTime < latterMsgTime){
                return 1;
            } else {
                return 0;
            }
          });
        }
        for (var i = 0;i < messageArray.length; i++) {
          var msgs = parseMessages(messageArray[i]);
          msgs.id = messageArray[i].id;
          msgs.from = messageArray[i].number;
          msgArray.push(msgs);
        }
        
        var response = "{\"messages\": " + JSON.stringify(msgArray) +"}";                
        callback(null, response);        
      }
    }
  );    
};
