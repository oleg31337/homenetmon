var activedimmer='\
    <p>&nbsp;</p>\
    <p>&nbsp;</p>\
    <div class="ui active dimmer">\
    <div class="ui text loader">Loading</div>\
    </div>'
var globalsetinterval={}; //global object of timeout functions
const DEBUG=1;

function ip2int(ip) { // convert IP address to 32 bit decimal number
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}

function secondsToHms(d) {
    d = Number(d);
    var h = Math.floor(d / 3600);
    var m = Math.floor(d % 3600 / 60);
    var s = Math.floor(d % 3600 % 60);

    var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    return hDisplay + mDisplay + sDisplay; 
}

function setCookie(cname, cvalue, cexpire) { //function to set a cookie
  var expires='';
  if (typeof(cexpire) != 'undefined'){
    var d = new Date();
    d.setTime(d.getTime() + cexpire);
    expires = '; expires='+ d.toUTCString();
  }
  document.cookie = cname + '=' + cvalue + expires + '; path=/';
}

function getCookie(cname) { //function to read a single cookie value
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(';');
  for(var i = 0; i <ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function setClipboard(value,elem) { //function to copy specified text to clipboard and change data tooltip for 1 sec to Copied
    var tempInput = document.createElement("input");
    tempInput.style = "position: absolute; left: -1000px; top: -1000px";
    tempInput.value = value;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    elem.parentElement.setAttribute("data-tooltip","Copied");
    setTimeout(function(){elem.parentElement.setAttribute("data-tooltip","Copy");},1000);
}

function download(data, filename, type) {
    var file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var a = document.createElement("a"),
                url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);  
        }, 0); 
    }
}

function filterTable() { // function to filter table
  var input = document.getElementById("TableFilter"); //input filter in the menu bar
  var filter = input.value.toUpperCase(); // we perform case insensitive filtering
  var table = document.getElementById("HostsTable"); //get our table to filter
  var filtercolumns = table.querySelectorAll('th.filtrable'); // get filtrable columns from table header
  var filtercolidx= []; // filtrable columns indexes;
  for (i=0; i<filtercolumns.length; i++){
    filtercolidx.push(filtercolumns[i].cellIndex);
  }
  var tbody = table.getElementsByTagName("tbody")[0]; //get table body, to exclude header from filtering
  var tr = tbody.getElementsByTagName("tr"); // get all tr elements
  for (i = 0; i < tr.length; i++) {
    td=tr[i].getElementsByTagName("td"); // get all td elements
    var matchfound=0;
    for (j=0; j<filtercolidx.length; j++){ // go through all columns that are filtrable
      var txtValue = td[filtercolidx[j]].textContent || td[filtercolidx[j]].innerText;
      if (td[filtercolidx[j]].getAttribute('textvalue')){
        txtValue=td[filtercolidx[j]].getAttribute('textvalue');
      }
      ////console.log('txtvalue=='+txtValue);
      if (txtValue.toUpperCase().indexOf(filter) > -1) {
        matchfound++;
        break; // no need to process anything else as we have a match.
      }
    }
    if (matchfound != 0){
      tr[i].style.display = "";
    } else {
      tr[i].style.display = "none";
    }
  }
}

function errorTableContents(errmsg){
  document.getElementById("TableContents").innerHTML ='<div class="ui inverted placeholder segment"><div class="ui inverted icon header"><i class="exclamation triangle icon"></i>'+errmsg+'</div></div>';
  $('#TableDimmer').removeClass('active');  
}
function getTableData(){ // get instance and volumes data from the backend
  //console.log('getTableData');
  fetch("api/gethosts").catch((error)=>{})
  .then(response => response.json())
  .then(data => {
    generateTable(data);
  }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
}
function clearTableData(){
  //console.log('clearTableData');
  $('#TableDimmer').addClass('active');
}

function generateMenu(){ // build menu with accounts and regions
  //console.log('generateMenu');
  var inputfiltervalue='';
  if (document.getElementById("TableFilter") != null && document.getElementById("TableFilter").value !=''){
    inputfiltervalue = document.getElementById("TableFilter").value; //get the value of input filter in the menu bar
  }
  var menuitems='<div class="ui inverted top attached menu">\
  <div class="item"><img src="/images/appicon.png"></div>\
  <a class="ui item" id="rescan_button" onclick="requestRescan(false,\'subnet\')"><i class="globe icon"></i>Rescan network</a>\
  <a class="ui item" onclick="displayScanStats()"><i class="info circle icon"></i>Last scan info</a>\
  <a class="ui item" onclick="refreshTable()"><i class="sync alternate icon"></i>Refresh table</a>\
  <div class="right menu">\
  <div class="ui left icon item"><i class="filter icon"></i>&nbsp;<div class="ui transparent inverted input">&nbsp;<input id="TableFilter" type="text" placeholder="Filter..." onkeyup="filterTable()" onpaste="filterTable()" value="'+inputfiltervalue+'"></div></div>\
  <a class="ui item" onclick="document.getElementById(\'TableFilter\').value=\'\';filterTable()"><i class="trash alternate outline icon"></i>Clear<br/>filter</a>\
  <div class="ui disabled item" visible=false>-----------------</div>\
  <a class="ui item" onclick="settingsDialog()"><i class="settings icon"></i>&nbsp;Settings&nbsp;</a>\
  </div></div>'
  document.getElementById('MainMenu').innerHTML=menuitems;
  refreshTable();
  checkStatus();
  setInterval(checkStatus,10000);
}

function refreshTable(){ //refresh table data
  //console.log("refreshTable");
  clearTableData();
  getTableData();
}

function generateTable(tabledata) { // create instances table contents
  //console.log("generateTable");
  if (Object.keys(tabledata).length==0){
    document.getElementById("TableContents").innerHTML ='<div class="ui inverted placeholder segment"><div class="ui inverted icon header"><i class="search icon"></i>There is no hosts information at this moment</div></div>';
    setTimeout(function(){refreshTable();},10000);
    return;
  }
  var out = '<table id="HostsTable" class="ui sortable inverted very compact selectable celled table">\
  <thead><tr>\
  <th class="default-sort filtrable">IP Address</th>\
  <th class="filtrable">DNS Name</th>\
  <th class="filtrable">NetBIOS Name</th>\
  <th class="filtrable">Name</th>\
  <th class="filtrable">MAC Address</th>\
  <th class="no-sort filtrable">Ports</th>\
  </tr>\
  </thead><tbody id="hoststablebody">';
  out += "</tbody></table>"
  document.getElementById("TableContents").innerHTML = out;
  
  for(var i = 0; i < Object.keys(tabledata).length; i++) {
    var mac=Object.keys(tabledata)[i];
    var host=tabledata[Object.keys(tabledata)[i]];
    updateTableRow(host);
    //finally initiate automatic refresh
    let ipaddr=host.ipaddr;
    let macaddr=mac;
    if (typeof (globalsetinterval[macaddr]) == 'number') {
      clearTimeout(globalsetinterval[macaddr]);
      delete globalsetinterval[macaddr];
    };
    globalsetinterval[macaddr]=setTimeout(function(){ requestUpdate((macaddr.toString()),(ipaddr.toString())); }, 60000-Math.floor(Math.random() * 2001));
    setTimeout(function(){ requestUpdate(macaddr,ipaddr); },5100-Math.floor(Math.random() * 5001));
    ////console.log(typeof(globalsetinterval[j]));
    ////console.log(globalsetinterval[j]);
  }
  $('table').tablesort().data('tablesort').sort($("th.default-sort"));
  filterTable();
  $('#TableDimmer').removeClass('active');
}

function updateTableRow(host,callback){
  mac=host.mac;
  tbody=document.getElementById("hoststablebody");
  if (!document.getElementById(host.ipaddr)){
    var tablerow=tbody.insertRow();
    tablerow.setAttribute("class", "filtrabletr");
    tablerow.id=host.ipaddr;
  }
  else {
    tablerow=document.getElementById(host.ipaddr);
  }
  
  var avail_color="red"; //default availability label color
  if (host.latency>-1){
    avail_color="green";
  }
  else {
    avail_color="red";
  }
  var portslist=''; // generate list of ports
  if (host.ports!='nodata' && host.ports!='discovery'){
    var ports_tcp=[];
    var ports_udp=[];
    for (var j=0;j<host.ports.length;j++){

      if (host.ports[j].protocol=='tcp') {
        if (host.ports[j].number == 443){
          ports_tcp.push('&nbsp;<span class="ui" data-tooltip="'+host.ports[j].service+'" data-variation="mini" data-inverted=""><a target="_blank" href="https://'+host.ipaddr+'">'+host.ports[j].number+'</a></span>');
        }
        else {
          ports_tcp.push('&nbsp;<span class="ui" data-tooltip="'+host.ports[j].service+'" data-variation="mini" data-inverted=""><a target="_blank" href="http://'+host.ipaddr+':'+host.ports[j].number+'">'+host.ports[j].number+'</a></span>');
        }
      }
      else {
        ports_udp.push('&nbsp;<span class="ui" data-tooltip="'+host.ports[j].service+'" data-variation="mini" data-inverted="">'+host.ports[j].number+'</span>');
      }
    }
    if (ports_tcp.length>0){
      portslist+='TCP:&nbsp;'+ports_tcp.join(", ");
    }
    if (ports_udp.length>0){
      portslist+='</br>UDP:&nbsp;'+ports_udp.join(", ");
    }
  }
  else if (host.ports=='discovery') {
    portslist='<div class="ui inline active inline loader"></div>&nbsp;&nbsp;&nbsp;Scanning is in progress';
  }
  else {
    portslist='No open ports found. Try to rescan with more ports in scope.';
  }
  if (host.scanning){
    //vail_color="gray";
    portslist='<div class="ui inline active inline loader"></div>&nbsp;&nbsp;&nbsp;Scanning is in progress';
  }
  //now generate main table
  var out='<td data-sort-value="'+ip2int(host.ipaddr)+'" textvalue="'+host.ipaddr+'">'+host.ipaddr+'&nbsp;\
  &nbsp;<span class="ui" data-tooltip="Copy" data-variation="mini" data-inverted=""><i class="ui copy outline icon link" onclick="setClipboard(\''+host.ipaddr+'\',this)"></i></span>\
  </br><span class="ui" data-tooltip="Rescan" data-variation="mini" data-inverted=""><i class="ui sync alternate icon link" onclick="requestRescan(\''+mac+'\',\''+host.ipaddr+'\')"></i></span>\
  &nbsp;<span class="ui" data-tooltip="Ping" data-variation="mini" data-inverted=""><i class="ui heartbeat alternate icon link '+avail_color+'" onclick="requestUpdate(\''+mac+'\',\''+host.ipaddr+'\')"></i></span>\
  &nbsp;<span class="ui" data-tooltip="Delete" data-variation="mini" data-inverted=""><i class="ui x icon link" onclick="confirmDelete(\''+mac+'\',\''+host.ipaddr+'\')"></i></span>\
  </td>';
  var datasortdnsname = host.dnsnames.toString().trim();
  if (datasortdnsname == ""){ datasortdnsname='zzzzzzzzzzzzzzzzzzzz'};
  out+='<td data-sort-value="'+datasortdnsname+'">'+host.dnsnames.toString()+'</td>';
  var datasortnetbiosname = host.netbiosname.toString().trim();
  if (datasortnetbiosname == ""){ datasortnetbiosname='zzzzzzzzzzzzzzzzzzzz'};
  out+='<td data-sort-value="'+datasortnetbiosname+'">'+host.netbiosname.toString()+'</td>';
  var datasorthostname = host.name.toString().trim();
  if (datasorthostname == ""){ datasorthostname='zzzzzzzzzzzzzzzzzzzz'};
  out+='<td data-sort-value="'+datasorthostname+'" textvalue="'+host.name+'"><div class="ui inverted transparent input"><input placeholder="Noname" type="text" onkeyup="changeName(this,event,\''+mac+'\',this.value)" value="'+host.name+'"></div></td>';
  var vendor = host.vendor ? '</br>Vendor: '+host.vendor : '</br>Vendor: unknown';
  out+='<td>'+mac+'&nbsp;<span class="ui" data-tooltip="Copy" data-variation="mini" data-inverted=""><i class="ui copy outline icon link" onclick="setClipboard(\''+mac+'\',this)"></i></span>'+vendor+'</td>';
  out+='<td>'+portslist+'</td>';
  tablerow.innerHTML = out;
  if (typeof(callback)=='function'){ callback(host); }
}

function checkStatus(){ // get instance and volumes data from the backend
  //console.log('checkStatus');
  fetch("api/getnmaprun").catch((error)=>{})
  .then(response => response.json())
  .then(data => {
    if (data) {
      if (data.msg=='ok'){
        document.getElementById("rescan_button").innerHTML='<i class="globe icon"></i>Rescan network'
      }
      else {
        document.getElementById("rescan_button").innerHTML='<div class="ui active inline loader"></div>&nbsp;&nbsp;&nbsp;Scanning is in progress';
      }
    }
    else {
      document.getElementById("rescan_button").innerHTML='<i class="x icon"></i>Unavailable';
    }
  })
  .catch((error)=>{
    //console.warn (error);
    document.getElementById("rescan_button").innerHTML='<i class="x icon"></i>App is unavailable';
  });
}

function changeName(elem,evt,mac,newname){
  if (evt.key == 'Enter') {
    //console.log('changeName');
    ////console.log(mac,newname);
    postData('api/setname',{'mac':mac,'newname':newname}).then (data => {
      ////console.log(data);
      if (typeof data.msg !='undefined'){
        elem.parentElement.parentElement.setAttribute('textvalue',newname);
        elem.blur();
        ////console.log(data.msg);
      }
      else {
        responseDialog(undefined,data.err);
      }
    });
  }
}

async function postData(url = '', data = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return response.json();
}

function requestUpdate(macaddr,ipaddr){
  //console.log('requestUpdate');
  if (typeof (globalsetinterval[macaddr]) == 'number') {
    clearTimeout(globalsetinterval[macaddr]);
    delete globalsetinterval[macaddr];
  };
  document.getElementById(ipaddr).getElementsByClassName("ui heartbeat alternate icon link")[0].className="ui heartbeat alternate icon link gray";
  ////console.log(mac,name);
  fetch("api/gethost?mac="+macaddr)
  .catch((error)=>{})
  .then(resp=>resp.json()).then(data=>{
    updateTableRow(data);
    globalsetinterval[macaddr]=setTimeout(function(){ requestUpdate((macaddr.toString()),(ipaddr.toString())); }, 60000-Math.floor(Math.random() * 2001));
  })
  .catch((error)=>{});
}

function confirmDelete(macaddr,ipaddr){
  //console.log('confirmDelete');
  confirmDialog("Delete "+macaddr,"Are you sure you want to delete this host?","requestDelete('"+macaddr+"','"+ipaddr+"')");
}

function requestDelete(macaddr,ipaddr){
  //console.log('requestDelete');
  macaddr=macaddr.trim();
  ipaddr=ipaddr.trim();
  ////console.log([macaddr,ipaddr]);
  postData('api/deletehost',{'mac':macaddr,'ip':ipaddr}).then (data => {
    ////console.log(data);
    if (typeof(data.msg) !='undefined'){
      if (typeof (globalsetinterval[macaddr]) == 'number') {
        clearTimeout(globalsetinterval[macaddr]);
        delete globalsetinterval[macaddr];
      };
      ////console.log(data.msg);
      document.getElementById(ipaddr).remove();
    }
    else {
      responseDialog(undefined,data.err);
    }
  }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
}

function requestRescan(macaddr,ipaddr){
  //console.log('requestRescan');
  if (ipaddr !='subnet'){
    document.getElementById(ipaddr).children[5].innerHTML='<div class="ui inline active inline loader"></div>&nbsp;&nbsp;&nbsp;Scanning is in progress'
    if (typeof (globalsetinterval[macaddr]) == 'number') {
      clearTimeout(globalsetinterval[macaddr]);
      delete globalsetinterval[macaddr];
    };
  }
  document.getElementById("rescan_button").innerHTML='<div class="ui inline active inline loader"></div>&nbsp;&nbsp;&nbsp;Scanning is in progress';
  ////console.log(mac,name);
  postData('api/nmapscan',{'ip':ipaddr}).then (data => {
    ////console.log(data);
    if (typeof(data.msg) !='undefined'){
      ////console.log(data.msg)
      if (ipaddr =='subnet') responseDialog(data.msg,undefined);
    }
    else {
      responseDialog(undefined,data.err);
      if (ipaddr !='subnet') requestUpdate(macaddr,ipaddr);
      return;
    }
  }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
  if (ipaddr !='subnet') globalsetinterval[macaddr]=setTimeout(function(){ requestUpdate((macaddr.toString()),(ipaddr.toString())); }, 1000);
}

/* function requestPing(ipaddr){
  //console.log('requestPing');
  if (typeof ipaddr =='undefined'){return;}
  document.getElementById(ipaddr).getElementsByClassName("ui medium label")[0].className="ui medium label gray";
  postData('api/ping',{'ip':ipaddr}).then (data => {
    ////console.log(data);
    if (data.msg == 'ok' && data.latency >= 0){
      document.getElementById(ipaddr).getElementsByClassName("ui medium label")[0].className="ui medium label green";
    }
    else {
      document.getElementById(ipaddr).getElementsByClassName("ui medium label")[0].className="ui medium label red";
    }
  });
} */

function confirmDialog(title,question,funct){ // confirmation dialog
    document.getElementById('modal_contents').setAttribute("class", "ui mini modal");
    document.getElementById('modal_contents').setAttribute("style", "");
    document.getElementById('modal_contents').innerHTML='\
        <div class="ui header">'+title+'</div>\
        <div class="content">'+question+'</div>\
        <div class="ui actions">\
          <div class="ui green ok button" onclick="'+funct+'">Yes</div>\
          <div class="ui red deny button">Cancel</div>\
        </div>';
    $('.ui.mini.modal').modal('setting', 'closable', true);
    $('.ui.mini.modal').modal('show');
}
function responseDialog(message,error){ // response and error dialog
  document.getElementById('modal_contents').setAttribute("class", "ui mini modal");
  document.getElementById('modal_contents').setAttribute("style", "");
  if (typeof error !== 'undefined') {
    document.getElementById('modal_contents').innerHTML='\
    <h2 class="ui header"><i class="exclamation triangle icon"></i>'+error[0]+'</h2><div class="content">'+error[1]+'</div>\
    <div class="ui actions">\
      <div class="ui green ok button">OK</div>\
    </div>';
  } else if (typeof message !== 'undefined') {
    document.getElementById('modal_contents').innerHTML='\
    <h2 class="ui header"><i class="thumbs up icon"></i>'+message[0]+'</h2><div class="content">'+message[1]+'</div>\
    <div class="ui actions">\
      <div class="ui green ok button">OK</div>\
    </div>';
  }
  $('.ui.mini.modal').modal('setting', 'closable', true);
  $('.ui.mini.modal').modal('show');
}

function displayScanStats(){ // show last scan stats
  document.getElementById('modal_contents').setAttribute("class", "ui large modal");
  document.getElementById('modal_contents').setAttribute("style", "background-color:#4d4d4d; color:#f2f2f2");
  fetch("api/getlastscan")
    .catch((error)=>{})
    .then(resp=>resp.json())
    .then(scanstats=>{
      var contents='<div class="header" style="background-color:#4d4d4d; color:#f2f2f2">Last full network scan information</div>\
        <table class="ui inverted very compact celled table">\
        <tr><td>Scan started</td><td>'+scanstats.runstats.startstr+'</td></tr>\
        <tr><td>Scan finished</td><td>'+scanstats.runstats.timestr+'</td></tr>\
        <tr><td>Time elapsed</td><td>'+secondsToHms(scanstats.runstats.elapsed)+'</td></tr>\
        <tr><td>Hosts scanned</td><td>'+scanstats.hosts.total+'</td></tr>\
        <tr><td>Hosts online</td><td>'+scanstats.hosts.up+'</td></tr>\
        <tr><td>Nmap command line</td><td>'+scanstats.runstats.args+'</td></tr>\
        </table>\
        <div class="actions" style="background-color:#4d4d4d; color:#f2f2f2">\
            <div class="ui black deny right button">Close</div>\
        </div>';
      document.getElementById('modal_contents').innerHTML=contents;
    }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
  document.getElementById('modal_contents').innerHTML=activedimmer+'</br><div class="actions"><div class="ui black deny right button">Close</div></div>;';
  $('.ui.large.modal').modal('setting', 'closable', true);
  $('.ui.large.modal').modal('show');
}

function settingsDialog(){ // show settings dialog
  document.getElementById('modal_contents').setAttribute("class", "ui tiny modal");
  document.getElementById('modal_contents').setAttribute("style", "background-color:#4d4d4d; color:#f2f2f2");
  fetch("api/getsettings")
    .catch((error)=>{})
    .then(resp=>resp.json())
    .then(settings=>{
      //console.log(settings);
      var subnet=settings.subnet ? settings.subnet : '192.168.1.0';
      var netmask=settings.netmask ? settings.netmask : '24';
      var speed=settings.speed ? settings.speed : 5;
      var ports=settings.ports ? settings.ports : 'known';
      var cronexpr=settings.cronexpr ? settings.cronexpr : '0 3 * * *';
      var cronenable=settings.cronenable ? settings.cronenable : false;
      var contents='<div class="ui header" style="background-color:#4d4d4d; color:#f2f2f2"><i class="settings icon"></i>&nbsp;Settings</div>\
        <div class="content" style="background-color:#4d4d4d; color:#f2f2f2">\
          <form class="ui form segment" action="/api/savesettings" method="post" style="background-color:#4d4d4d; color:#f2f2f2">\
            <div class="two fields">\
              <div class="field">\
                <label style="color:#f2f2f2">Subnet address</label>\
                <input type="text" id="input_subnet" placeholder="192.168.1.0" name="subnet">\
              </div>\
              <div class="field">\
                <label style="color:#f2f2f2">Netmask</label>\
                <input type="text" id="input_netmask" placeholder="24 or 255.255.255.0" name="netmask">\
              </div>\
            </div>\
            <div class="two fields">\
                <div class="field">\
                <label style="color:#f2f2f2">Scan speed</label>\
                <select class="ui fluid dropdown" id="select_speed" name="speed">\
                  <option value="5">Fast (may skip ports)</option>\
                  <option value="4">Normal (might skip ports)</option>\
                  <option value="3">Slow (thorough)</option>\
                </select>\
                </div>\
                <div class="field">\
                <label style="color:#f2f2f2">Number of ports</label>\
                <select class="ui fluid dropdown" id="select_ports" name="ports">\
                  <option value="100">100 ports (fastest)</option>\
                  <option value="1000">1000 ports (fast)</option>\
                  <option value="1500">1500 ports (moderate)</option>\
                  <option value="2000">2000 ports (slower)</option>\
                  <option value="5000">5000 ports (slow)</option>\
                  <option value="10000">10000 ports (very slow)</option>\
                  <option value="65535">All 65535 ports (insanely slow)</option>\
                </select>\
                </div>\
            </div>\
            <div class="field">\
                <div class="field">\
                  <label style="color:#f2f2f2">Scheduled scan time</label>\
                  <input type="text" id="input_cron" placeholder="0 0 * * *" name="cronexpr">\
                  <label style="color:#f2f2f2">(Cron expression: minute hour day month weekday)</label>\
                </div>\
            </div>\
            <div class="field">\
              <div class="field">\
              <div class="ui toggle checkbox">\
                <input type="checkbox" tabindex="0" id="checkbox_cron" checked=true name="cronenable">\
                <label style="color:#f2f2f2 !important">Enable scheduled scan</label>\
              </div>\
              </div>\
            </div>\
          </form>\
        </div>\
        <div class="ui actions"  style="background-color:#4d4d4d; color:#f2f2f2">\
          <div class="ui green button" onclick="submitForm()">Apply</div>\
          <div class="ui red cancel button">Cancel</div>\
        </div>';
      document.getElementById('modal_contents').innerHTML=contents;
      activateSettingsForm();
      document.getElementById('input_subnet').value=subnet;
      document.getElementById('input_netmask').value=netmask;
      document.getElementById('select_speed').value=speed;
      document.getElementById('select_ports').value=ports;
      document.getElementById('input_cron').value=cronexpr;
      document.getElementById('checkbox_cron').checked=cronenable;
    }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
  document.getElementById('modal_contents').innerHTML=activedimmer+'</br><div class="actions"><div class="ui black deny right button">Close</div></div>;';
  $('.ui.tiny.modal').modal('setting', 'closable', false);
  $('.ui.tiny.modal').modal('show');
}
function activateSettingsForm() {
    //console.warn('activateForm');
    $('.ui.form').form({
    on: 'blur',
    inline: true,
    fields: {
      cronexpr:{
      identifier: 'cronexpr',
      rules: [{
        type: 'regExp',
        value: /^((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5})$/,
        prompt: 'Please enter a valid cron expression'
      }]
      },
      subnet:{
      identifier: 'subnet',
      rules: [{
        type: 'regExp',
        value: /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))$/,
        prompt: 'Please enter a valid subnet address'
      }]
      },
      netmask:{
      identifier: 'netmask',
      rules: [{
        type: 'regExp',
        value: /(^([8-9]|0[8-9]|[1-2][0-9]|3[0-2])$)|(^(((255\.){3}(255|254|252|248|240|224|192|128|0+))|((255\.){2}(255|254|252|248|240|224|192|128|0+)\.0)|((255\.)(255|254|252|248|240|224|192|128|0+)(\.0+){2})|((255|254|252|248|240|224|192|128|0+)(\.0+){3}))$)/,
        prompt: 'Please enter a valid netmask'
      }]
      }
    }
    });
}
function submitForm(){
  //console.log('submitForm');
  $('.ui.form.segment').form('submit');
}

function appInit() { // main app that is called from the html page to initialize the frontend app
  //console.log('appInit');
  generateMenu();
}