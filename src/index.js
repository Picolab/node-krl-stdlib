var _ = require("lodash");
var types = require("./types");

//coerce the value into a key string
var toKey = function(val){
    return types.toString(val);
};

//coerce the value into an array of key strings
var toKeyPath = function(path){
    if(!types.isArray(path)){
        path = [path];
    }
    return _.map(path, toKey);
};

var iterBase = function*(val, iter){
    var should_continue;
    if(types.isArray(val)){
        var i;
        for(i = 0; i < val.length; i++){
            should_continue = yield iter(val[i], i, val);
            if(!should_continue) break;
        }
    }else{
        var key;
        for(key in val){
            if(_.has(val, key)){
                should_continue = yield iter(val[key], key, val);
                if(!should_continue) break;
            }
        }
    }
};

// some guidelines/suggestions:
// 0. effectively check arguments.length when not fixed by the grammar (and consider null versus omitted)
// 1. convert NaN's/void 0's when needed (i.e. use cleanNulls)
// 2. don't mutate arguments (array/map)
// 3. where strings/numbers/arrays are expected, convert to them when reasonable (don't coerce arrays to maps)
// 4. prioritize errors on val's type (if applicable), then argument values/types/0. from left to right
// 5. try to return the logical noop value (e.g. false, [], val (unchanged by 3.)) for missing or unrecoverably wrongly typed arguments
// 6. don't worry about call stack limits when processing deep objects - Lodash is incorrect there too
// 7. the wiki's docs take precedence over the above
var stdlib = {};

//Infix operators///////////////////////////////////////////////////////////////
var ltEqGt = function(left, right){
    if(types.typeOf(left) !== types.typeOf(right)){
        return NaN; // unlike -1/0/1, all comparisons with 0 are false
    }
    left = types.cleanNulls(left);
    right = types.cleanNulls(right);
    if(_.isEqual(left, right)){
        return 0;
    }
    if(types.isArrayOrMap(left)){
        return NaN; // don't compare unequal arrays or maps
    }
    return (left > right) ? 1 : -1;
};

stdlib["<"] = function(ctx, left, right){
    return ltEqGt(left, right) < 0;
};
stdlib[">"] = function(ctx, left, right){
    return ltEqGt(left, right) > 0;
};
stdlib["<="] = function(ctx, left, right){
    return ltEqGt(left, right) <= 0;
};
stdlib[">="] = function(ctx, left, right){
    return ltEqGt(left, right) >= 0;
};
stdlib["=="] = function(ctx, left, right){
    return types.isEqual(left, right);
};
stdlib["!="] = function(ctx, left, right){
    return ! types.isEqual(left, right);
};

stdlib["+"] = function(ctx, left, right){
    if(arguments.length < 3){
        return left;
    }
    //if we have two "numbers" then do plus
    if(types.isNumber(left) && types.isNumber(right)){
        return left + right;
    }
    //else do concat
    return types.toString(left) + types.toString(right);
};
stdlib["-"] = function(ctx, left, right){
    var leftNumber = types.numericCast(left);
    if(arguments.length < 3){
        if(leftNumber === null){
            throw new TypeError("Cannot negate " + types.toString(left));
        }
        return -leftNumber;
    }
    var rightNumber = types.numericCast(right);
    if(leftNumber === null || rightNumber === null){
        throw new TypeError(types.toString(right) + " cannot be subtracted from " + types.toString(left));
    }
    return leftNumber - rightNumber;
};
stdlib["*"] = function(ctx, left, right){
    var leftNumber = types.numericCast(left);
    var rightNumber = types.numericCast(right);
    if(leftNumber === null || rightNumber === null){
        throw new TypeError(types.toString(left) + " cannot be multiplied by " + types.toString(right));
    }
    return leftNumber * rightNumber;
};
stdlib["/"] = function(ctx, left, right){
    var leftNumber = types.numericCast(left);
    var rightNumber = types.numericCast(right);
    if(leftNumber === null || rightNumber === null){
        throw new TypeError(types.toString(left) + " cannot be divided by " + types.toString(right));
    }
    if(rightNumber === 0){
        throw new RangeError(leftNumber + " / 0 is not a number");
    }
    return leftNumber / rightNumber;
};
stdlib["%"] = function(ctx, left, right){
    var leftNumber = types.numericCast(left);
    var rightNumber = types.numericCast(right);
    if(leftNumber === null || rightNumber === null){
        throw new TypeError("Cannot calculate " + types.toString(left) + " modulo " + types.toString(right));
    }
    if(rightNumber === 0){
        return 0;
    }
    return leftNumber % rightNumber;
};

stdlib["><"] = function(ctx, obj, val){
    var keys;
    if(types.isArray(obj)){
        keys = obj;
    }else if(types.isMap(obj)){
        keys = _.keys(obj);
    }else{
        keys = [obj];
    }
    return stdlib.index(ctx, keys, val) >= 0;
};

stdlib.like = function(ctx, val, regex){
    if(!types.isRegExp(regex)){
        regex = new RegExp(types.toString(regex));
    }
    return regex.test(types.toString(val));
};

stdlib["<=>"] = function(ctx, left, right){
    var leftNumber = types.numericCast(left);
    var rightNumber = types.numericCast(right);
    if(leftNumber !== null && rightNumber !== null){
        return ltEqGt(leftNumber, rightNumber);
    }
    var result = ltEqGt(left, right);
    if(_.isNaN(result)){
        throw new TypeError("The <=> operator will not compare " + types.toString(left) + " with " + types.toString(right));
    }
    return result;
};
stdlib.cmp = function(ctx, left, right){
    var leftStr = types.toString(left);
    var rightStr = types.toString(right);
    return ltEqGt(leftStr, rightStr);
};

stdlib.beesting = function(ctx, val){
    return stdlib.as(ctx, val, "String");
};

////////////////////////////////////////////////////////////////////////////////
//
//Operators
//
stdlib.as = function(ctx, val, type){
    if(arguments.length < 3){
        return val;
    }
    var val_type = types.typeOf(val);
    if(val_type === type){
        return val;
    }
    if(type === "Boolean"){
        if(val === "false"){
            return false;
        }
        if(val_type === "Number"){
            return val !== 0;
        }
        return !!val;
    }
    if(type === "String"){
        return types.toString(val);
    }
    if(type === "Number"){
        if(val_type === "Null"){
            return 0;
        }else if(val_type === "Boolean"){
            return val ? 1 : 0;
        }else if(val_type === "String"){
            var n = parseFloat(val);
            return types.isNumber(n)
                ? n
                : null;
        }
        return null;
    }
    if(type === "RegExp"){
        if(val_type === "String"){
            return new RegExp(val);
        }
    }
    throw new TypeError("Cannot use the .as(\""+type+"\") operator with " + types.toString(val) + " (type " + val_type + ")");
};

stdlib.isnull = function(ctx, val){
    return types.isNull(val);
};

stdlib.klog = function(ctx, val, message){
    if(arguments.length < 3){
        ctx.emit("klog", {val: val});
    }else{
        ctx.emit("klog", {val: val, message: types.toString(message)});
    }
    return val;
};

stdlib["typeof"] = function(ctx, val){
    return types.typeOf(val);
};

var format = function(val, template, specifier){
    return _.join(
        _.map(template.split(/\\\\/g), function(v){
            return v.replace(new RegExp("(^|[^\\\\])" + specifier, "g"), "$1" + val + "");
        }),
        "\\"
    ).replace(new RegExp("\\\\" + specifier, "g"), specifier);
};

stdlib.sprintf = function(ctx, val, template){
    if(arguments.length < 3){
        return "";
    }
    template = types.toString(template);
    if(types.isNumber(val)){
        return format(val, template, "%d");
    }
    if(types.isString(val)){
        return format(val, template, "%s");
    }
    return template;
};

stdlib.defaultsTo = function(ctx, val, defaultVal, message){
    if(!types.isNull(val)){
        return val; // not important whether defaultVal is missing
    }
    if(arguments.length < 3){
        throw new Error("The .defaultsTo() operator needs a default value");
    }
    if(!types.isNull(message)){
        ctx.emit("debug", "[DEFAULTSTO] " + types.toString(message));
    }
    return defaultVal;
};

//Number operators//////////////////////////////////////////////////////////////
stdlib.chr = function(ctx, val){
    var code = types.numericCast(val);
    if(code === null){
        return null;
    }
    return String.fromCharCode(code);
};
stdlib.range = function(ctx, val, end){
    var startNumber = types.numericCast(val);
    var endNumber = types.numericCast(end);
    if(startNumber === null || endNumber === null){
        return []; // we could return [number] if one of them is a number
    }
    if(startNumber < endNumber){
        return _.range(startNumber, endNumber + 1);
    }
    return _.range(startNumber, endNumber - 1);
};

//String operators//////////////////////////////////////////////////////////////
stdlib.capitalize = function(ctx, val){
    val = types.toString(val);
    if(val.length === 0){
        return "";
    }
    return val[0].toUpperCase() + val.slice(1);
};
stdlib.decode = function(ctx, val){
    if(!types.isString(val)){
        return val;
    }
    try{
        return JSON.parse(val);
    }catch(e){
        return val;
    }
};
stdlib.extract = function(ctx, val, regex){
    if(arguments.length < 3){
        return [];
    }
    val = types.toString(val);
    if(!types.isRegExp(regex)){
        regex = new RegExp(types.toString(regex));
    }
    var r = val.match(regex);
    if(!r){
        return [];
    }
    if(regex.global){
        return r;
    }
    return r.slice(1);
};
stdlib.lc = function(ctx, val){
    val = types.toString(val);
    return val.toLowerCase();
};
stdlib.match = function(ctx, val, regex){
    if(types.isString(regex)){
        regex = new RegExp(regex);
    }else if(!types.isRegExp(regex)){
        return false;
    }
    return regex.test(types.toString(val));
};
stdlib.ord = function(ctx, val){
    val = types.toString(val);
    var code = val.charCodeAt(0);
    return _.isNaN(code) ? null : code;
};
stdlib.replace = function(ctx, val, regex, replacement){
    if(arguments.length < 3){
        return val;
    }
    val = types.toString(val);
    if(!types.isString(regex) && !types.isRegExp(regex)){
        regex = types.toString(regex);
    }
    if(types.isNull(replacement)){
        return val.replace(regex, "");
    }
    return val.replace(regex, types.toString(replacement));
};
stdlib.split = function(ctx, val, split_on){
    val = types.toString(val);
    if( ! types.isRegExp(split_on)){
        split_on = types.toString(split_on);
    }
    return val.split(split_on);
};
stdlib.substr = function(ctx, val, start, len){
    start = types.numericCast(start);
    if(start === null){
        return val;
    }
    val = types.toString(val);
    if(start > val.length){
        return null;
    }
    len = types.numericCast(len);
    var end;
    if(len === null){
        end = val.length;
    }else if(len > 0){
        end = start + len;
    }else{
        end = val.length + len;
    }
    return val.substring(start, end);
};
stdlib.uc = function(ctx, val){
    val = types.toString(val);
    return val.toUpperCase();
};

//Collection operators//////////////////////////////////////////////////////////
//operators using KRL functions are generators to be async-friendly (co library)
stdlib.all = function*(ctx, val, iter){
    if(!types.isArray(val)){
        val = [val];
    }
    if(!types.isFunction(iter)){
        return val.length === 0;
    }
    var broke = false;
    yield iterBase(val, function*(v, k, obj){
        var r = yield iter(ctx, [v, k, obj]);
        if(!r){
            broke = true;
            return false;//stop
        }
        return true;
    });
    return !broke;
};
stdlib.notall = function*(ctx, val, iter){
    return !(yield stdlib.all(ctx, val, iter)); // works b/c of co library
};
stdlib.any = function*(ctx, val, iter){
    if(!types.isFunction(iter)){
        return false;
    }
    if(!types.isArray(val)){
        val = [val];
    }
    var broke = false;
    yield iterBase(val, function*(v, k, obj){
        var r = yield iter(ctx, [v, k, obj]);
        if(r){
            broke = true;
            return false;//stop
        }
        return true;
    });
    return broke;
};
stdlib.none = function*(ctx, val, iter){
    return !(yield stdlib.any(ctx, val, iter));
};
stdlib.append = function(ctx, val, others){
    return _.concat.apply(void 0, _.tail(_.toArray(arguments)));
};
// works for arrays (documented) and maps (undocumented)
stdlib.collect = function*(ctx, val, iter){
    if(!types.isFunction(iter)){
        return {};
    }
    if(!types.isArrayOrMap(val)){
        val = [val];
    }
    var grouped = {};
    yield iterBase(val, function*(v, k, obj){
        var r = yield iter(ctx, [v, k, obj]);
        if(!grouped.hasOwnProperty(r)){
            grouped[r] = [];
        }
        grouped[r].push(v);
        return true;
    });
    return grouped;
};
stdlib.filter = function*(ctx, val, iter){
    if(!types.isFunction(iter)){
        return val;
    }
    var is_array = !types.isMap(val);
    if(is_array && !types.isArray(val)){
        val = [val];
    }
    var rslt = is_array ? [] : {};
    yield iterBase(val, function*(v, k, obj){
        var r = yield iter(ctx, [v, k, obj]);
        if(r){
            if(is_array){
                rslt.push(v);
            }else{
                rslt[k] = v;
            }
        }
        return true;
    });
    return rslt;
};
stdlib.head = function(ctx, val){
    if(!types.isArray(val)){
        return val; // head is for arrays; pretend val is a one-value array
    }
    return val[0];
};
stdlib.tail = function(ctx, val){
    if(!types.isArray(val)){
        return [];
    }
    return _.tail(val);
};
stdlib.index = function(ctx, val, elm){
    if(arguments.length < 3){
        return -1;
    }
    if(!types.isArray(val)){
        val = [val];
    }
    return _.findIndex(val, _.partial(types.isEqual, elm));
};
stdlib.join = function(ctx, val, str){
    if(!types.isArray(val)){
        return val;
    }
    val = types.cleanNulls(val);
    if(arguments.length < 3){
        return _.join(val, ",");
    }
    return _.join(val, types.toString(str));
};
//works for maps for weak typing purposes
stdlib.length = function(ctx, val){
    if(types.isArrayOrMap(val) || types.isString(val)){
        return _.size(val);
    }
    return 0; // we could check function.prototype.length
};
stdlib.map = function*(ctx, val, iter){
    if(!types.isFunction(iter)){
        return val;
    }
    var is_array = !types.isMap(val);
    if(is_array && !types.isArray(val)){
        val = [val];
    }
    var rslt = is_array ? [] : {};
    yield iterBase(val, function*(v, k, obj){
        var r = yield iter(ctx, [v, k, obj]);
        if(is_array){
            rslt.push(r);
        }else{
            rslt[k] = r;
        }
        return true;
    });
    return rslt;
};
stdlib.pairwise = function*(ctx, val, iter){
    if(!types.isArray(val)){
        throw new TypeError("The .pairwise() operator cannot be called on " + types.toString(val));
    }
    if(val.length < 2){
        throw new TypeError("The .pairwise() operator needs a longer array");
    }
    if(arguments.length < 3){
        throw new Error("The .pairwise() operator needs a function");
    }
    if(!types.isFunction(iter)){
        throw new TypeError("The .pairwise() operator cannot use " + types.toString(iter) + " as a function");
    }
    val = _.map(val, function(v){
        if(types.isArray(v)){
            return v;
        }
        return [v];
    });
    var max_len = _.max(_.map(val, _.size));

    var r = [];

    var i;
    var j;
    var args2;
    for(i = 0; i < max_len; i++){
        args2 = [];
        for(j = 0; j < val.length; j++){
            args2.push(val[j][i]);
        }
        r.push(yield iter(ctx, args2));
    }
    return r;
};
stdlib.reduce = function*(ctx, val, iter, dflt){
    if(!types.isArray(val)){
        val = [val];
    }
    var no_default = arguments.length < 4;
    if(val.length === 0){
        return no_default ? 0 : dflt;
    }
    if(!types.isFunction(iter) && (no_default || val.length > 1)){
        throw new Error("The .reduce() operator cannot use " + types.toString(iter) + " as a function");
    }
    if(val.length === 1){
        var head = val[0];
        if(no_default){
            return head;
        }
        return iter(ctx, [dflt, head]);
    }
    var acc = dflt;
    var is_first = true;
    yield iterBase(val, function*(v, k, obj){
        if(is_first && no_default){
            is_first = false;
            acc = v;
            return true;//continue
        }
        acc = yield iter(ctx, [acc, v, k, obj]);
        return true;//continue
    });
    return acc;
};
stdlib.reverse = function(ctx, val){
    if(!types.isArray(val)){
        return val;
    }
    return _.reverse(_.cloneDeep(val));
};
stdlib.slice = function(ctx, val, start, end){
    if(!types.isArray(val)){
        val = [val];
    }else if(val.length === 0){
        ctx.emit("error", new Error("Cannot .slice() an empty array"));
        return null;
    }
    if(arguments.length === 2){
        return val;
    }
    var firstIndex = types.numericCast(start);
    if(firstIndex === null){
        throw new TypeError("The .slice() operator cannot use " + types.toString(start) + " as an index");
    }
    if(arguments.length === 3){
        if(firstIndex > val.length){
            ctx.emit("error", new RangeError("Cannot .slice() an array of length " + val.length + " from 0 to " + firstIndex));
            return null;
        }
        return _.slice(val, 0, firstIndex + 1);
    }
    var secondIndex = types.numericCast(end);
    if(secondIndex === null){
        throw new TypeError("The .slice() operator cannot use " + types.toString(end) + " as the other index");
    }
    if(firstIndex > secondIndex){ // this is why firstIndex isn't named startIndex
        var temp = firstIndex;
        firstIndex = secondIndex;
        secondIndex = temp;
    }
    if(firstIndex >= 0 && secondIndex < val.length){
        return _.slice(val, firstIndex, secondIndex + 1);
    }
    ctx.emit("error", new RangeError("Cannot .slice() an array of length " + val.length + " from " + firstIndex + " to " + secondIndex));
    return null;
};
stdlib.splice = function(ctx, val, start, n_elms, value){
    if(!types.isArray(val)){
        val = [val];
    }else if(val.length === 0){
        throw new Error("Cannot .splice() an empty array");
    }
    if(arguments.length < 4){
        throw new Error("The .splice() operator needs more than one argument");
    }
    var startIndex = types.numericCast(start);
    if(startIndex === null){
        throw new TypeError("The .splice() operator cannot use " + types.toString(start) + "as an index");
    }
    if(startIndex < 0){
        throw new RangeError("Cannot start .splice() starting at index " + startIndex);
    }
    if(startIndex >= val.length){
        throw new RangeError("Cannot .splice() an array of length " + val.length + " starting at index " + startIndex);
    }
    var n_elms_number = types.numericCast(n_elms);
    if(n_elms_number === null){
        throw new TypeError("The .splice() operator cannot use " + types.toString(n_elms) + "as a number of elements");
    }
    if(n_elms_number < 0 || startIndex + n_elms_number > val.length){
        n_elms_number = val.length - startIndex;
    }
    var part1 = _.slice(val, 0, startIndex);
    var part2 = _.slice(val, startIndex + n_elms);
    if(arguments.length < 5){
        return _.concat(part1, part2);
    }
    return _.concat(part1, value, part2);
};
stdlib.sort = (function(){
    var swap = function(arr, i, j){
        var temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    };
    return function*(ctx, val, sort_by){
        if(!types.isArray(val)){
            return val;
        }
        val = _.cloneDeep(val);
        var sorters = {
            "default": function(a, b){
                return stdlib.cmp(ctx, a, b);
            },
            "reverse": function(a, b){
                return -stdlib.cmp(ctx, a, b);
            },
            "numeric": function(a, b){
                return stdlib["<=>"](ctx, a, b);
            },
            "ciremun": function(a, b){
                return -stdlib["<=>"](ctx, a, b);
            }
        };
        if(_.has(sorters, sort_by)){
            return val.sort(sorters[sort_by]);
        }
        if(!types.isFunction(sort_by)){
            return val.sort(sorters["default"]);
        }
        var sorted = val;
        var i, j, a, b;
        var len = sorted.length;
        //TODO optimize with a better sort algorithm
        for (i = len - 1; i >= 0; i--){
            for(j = 1; j <= i; j++){
                a = sorted[j-1];
                b = sorted[j];
                if((yield sort_by(ctx, [a, b])) > 0){
                    swap(sorted, j-1, j);
                }
            }
        }
        return sorted;
    };
})();
stdlib["delete"] = function(ctx, val, path){
    path = toKeyPath(path);
    //TODO optimize
    var n_val = _.cloneDeep(val);
    _.unset(n_val, path);
    return n_val;
};

var isSafeArrayIndex = function(arr, key){
    var index = _.parseInt(key, 10);
    if(_.isNaN(index)){
        return false;
    }
    return index >= 0 && index <= arr.length;//equal too b/c it's ok to append
};

stdlib.put = function(ctx, val, path, to_set){
    if(!types.isArrayOrMap(val) || arguments.length < 3){
        return val;
    }
    if(arguments.length < 4){
        to_set = path;
        path = [];
    }
    val = _.cloneDeep(val);
    path = toKeyPath(path);
    if(_.isEmpty(path)){
        if(types.isMap(to_set)){
            if(types.isMap(val)){
                return _.assign({}, val, to_set);
            }
        }else if(types.isArray(to_set)){
            if(types.isArray(val)){
                return _.assign([], val, to_set);
            }
        }
        return to_set;
    }
    var n_val = val;
    var nested = n_val;
    var i, key;
    for(i = 0; i < path.length; i++){
        key = path[i];
        if(i === path.length - 1){
            nested[key] = to_set;
        }else{
            if(types.isMap(nested[key])){
                //simply traverse down
            }else if(types.isArray(nested[key])){
                var next_key = path[i + 1];
                if(isSafeArrayIndex(nested[key], next_key)){
                    //simply traverse down
                }else{
                    //convert Array to Map b/c the key is not a safe index
                    nested[key] = _.assign({}, nested[key]);
                }
            }else{
                //need to create a Map to continue
                nested[key] = {};
            }
            nested = nested[key];
        }
    }
    return n_val;
};
stdlib.encode = function(ctx, val, indent){
    return types.encode(val, indent);
};
stdlib.keys = function(ctx, val, path){
    if(!types.isArrayOrMap(val)){
        return [];
    }
    if(path){
        path = toKeyPath(path);
        return _.keys(_.get(val, path));
    }
    return _.keys(val);
};
stdlib.values = function(ctx, val, path){
    if(!types.isArrayOrMap(val)){
        return [];
    }
    if(path){
        path = toKeyPath(path);
        return _.values(_.get(val, path));
    }
    return _.values(val);
};
stdlib.intersection = function(ctx, a, b){
    if(arguments.length < 3){
        return [];
    }
    if(!types.isArray(a)){
        a = [a];
    }
    if(!types.isArray(b)){
        b = [b];
    }
    return _.intersectionWith(a, b, types.isEqual);
};
stdlib.union = function(ctx, a, b){
    if(arguments.length < 3){
        return a;
    }
    if(!types.isArray(a)){
        a = [a];
    }
    if(!types.isArray(b)){
        b = [b];
    }
    return _.unionWith(a, b, types.isEqual);
};
stdlib.difference = function(ctx, a, b){
    if(arguments.length < 3){
        return a;
    }
    if(!types.isArray(a)){
        a = [a];
    }
    if(!types.isArray(b)){
        b = [b];
    }
    return _.differenceWith(a, b, types.isEqual);
};
stdlib.has = function(ctx, val, other){
    if(arguments.length < 3){
        return true;
    }
    if(!types.isArray(val)){
        val = [val];
    }
    return stdlib.difference(ctx, other, val).length === 0;
};
stdlib.once = function(ctx, val){
    if(!types.isArray(val)){
        return val;
    }
    //TODO optimize
    val = types.cleanNulls(val);
    var r = [];
    _.each(_.groupBy(val), function(group){
        if(group.length === 1){
            r.push(group[0]);
        }
    });
    return r;
};
stdlib.duplicates = function(ctx, val){
    if(!types.isArray(val)){
        return [];
    }
    //TODO optimize
    val = types.cleanNulls(val);
    var r = [];
    _.each(_.groupBy(val), function(group){
        if(group.length > 1){
            r.push(group[0]);
        }
    });
    return r;
};

stdlib.unique = function(ctx, val){
    if(!types.isArray(val)){
        return val;
    }
    return _.uniqWith(val, types.isEqual);
};

stdlib["get"] = function(ctx, obj, path){
    if(!types.isArrayOrMap(obj)){
        return null;
    }
    path = toKeyPath(path);
    return _.get(obj, path, null);
};

stdlib["set"] = function(ctx, obj, path, val){
    if(!types.isArrayOrMap(obj)){
        return obj;
    }
    path = toKeyPath(path);
    //TODO optimize
    obj = _.cloneDeep(obj);
    return _.set(obj, path, val);
};

module.exports = stdlib;
