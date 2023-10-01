
class appUtils {
    constructor() {
    }
    randomString(length) { // Function to generate random string with specified length
        var result = '';
        var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for ( var i = 0; i < length; i++ ) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    }

    findinArray(arr,strng){ // Function to find string in array and return array index or -1
        for (var aidx=0;aidx<arr.length;aidx++ ){
            if (arr[aidx]==strng){
                return aidx;
            }
        }
        return -1;
    }

    ip2int(ip) { // Convert decimal number representation to IP dotted address
        var d = ip.split('.');
        return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
    }

    int2ip(num) { // Convert IP dotted address to representing decimal number
        var ip = num%256;
        for (var i = 3; i > 0; i--)
        {
            num = Math.floor(num/256);
            ip = num%256 + '.' + ip;
        }
        return ip;
    }

    validateIPsubnet(ip) { //Validate IP address with netmask
        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/(0?[8-9]|[1-2][0-9]|3[0-2]))$/;
        return ipRegex.test(ip);
    }

    validateIPaddress(ip) { //Validate IP address without netmask
        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }
    
    validateIP(ip) { //Validate IP address with/without netmask
        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/(0?[8-9]|[1-2][0-9]|3[0-2])){0,1}$/;
        return ipRegex.test(ip);
    }

    validateMac(mac) { //Validate MAC address with comma in between octets
        const macRegex = /^([0-9A-Fa-f]{2}[:]){5}([0-9A-Fa-f]{2})$/;
        return macRegex.test(mac);
    }

    combineConsecutiveNumbers(numbers) { // Combines array of numbers into consecutive ranges sorted ascending
        numbers.sort((a, b) => a - b); // Sort the numbers in ascending order
        let ranges = [];
        let start = numbers[0];
        let end = numbers[0];
    
        for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] === end + 1) {
            end = numbers[i]; // Extend the current range
        } else {
            ranges.push({ start, end }); // Add the completed range to the list
            start = numbers[i]; // Start a new range
            end = numbers[i];
        }
        }
    
        ranges.push({ start, end }); // Add the last completed range to the list
    
        // Output the numbers within the ranges, separated by commas
        let output = '';
        for (let range of ranges) {
        if (range.start === range.end) {
            output += `${range.start},`;
        } else {
            output += `${range.start}-${range.end},`;
        }
        for (let num = range.start + 1; num < range.end; num++) {
            output += `${num},`;
        }
        }
    
        // Remove the trailing comma
        output = output.slice(0, -1);
    
        return output; //text string containing all numbers combined in ranges
    }
}

export default appUtils;