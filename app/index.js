import path        from 'path'
import http        from 'http'
import assert      from 'assert'
import Koa         from 'koa'
import koaStatic   from 'koa-static'
import moment      from 'moment'

import packageInfo from 'package'



var models = require('models')

if (module.hot) {
  module.hot.accept(['models'], function() {
    var models = require('models')
  });
}


// Add http 451
http.STATUS_CODES[451] = 'Unavailable For Legal Reasons'


export default function() {

  const app = new Koa()

  app.env = process.env.NODE_ENV || 'production'

  // error
  app.context.onerror = function(err) {
    if (null === err) {
      return;
    }

    assert(err instanceof Error, 'non-error thrown: ' + err);
    const ctx = this;

    // ENOENT support
    if ('ENOENT' === err.code) {
      err.status = 404;
    }

    if (err.status == 400 && err.statusCode > 400 && err.statusCode < 500) {
      err.status = err.status;
    }

    if ((err.code == 'HPE_INVALID_EOF_STATE' || err.code == 'ECONNRESET' || err.message == 'Request aborted') && !err.status) {
      err.status = 408;
    }

    if (err.name == 'ValidationError' || err.name == 'ValidatorError') {
      err.status = err.status || 403;
      err.code = err.name;
    }

    if (err.code == 'ValidationError' || err.code == 'ValidatorError') {
      err.status = err.status || 403;
    }

    if ('number' !== typeof err.status || !http.STATUS_CODES[err.status]) {
      err.status = 500;
    }

    if (!ctx.status || ctx.status < 300 || ctx.status == 404 || err.status >= 500) {
      ctx.status = err.status;
    }

    ctx.app.emit('error', err, ctx);

    if (err.status == 408) {
      return;
    }

    if (ctx.headerSent || !ctx.writable) {
      err.headerSent = true;
      return;
    }

    var state = {}


    ctx.set(err.headers)
    if (err.state) {
      if (typeof err.state.toJSON == 'function') {
        err.state = err.state.toJSON()
      }
      state = Object.assign(state, err.state)
    }

    var messages = [];
    if (err.name == 'ValidationError' && err.errors) {
      for (let path in err.errors) {
        let message = err.errors[path];
        messages.push({
          code: message.code || message.name,
          path: message.path || path,
          message: message.message,
        });
      }
    } else {
      messages.push({
        code: err.code || 'ERROR',
        status: err.status,
        message: (app.env == 'development' || err.status != 500) && err.message ? `${err.message}` : http.STATUS_CODES[err.status]
      });
    }

    var data = {
      status: err.status,
      messages: messages,
    };
    data = Object.assign(state, data);

    ctx.type = 'json'
    ctx.set("X-Content-Type-Options", 'nosniff')
    ctx.res.end(JSON.stringify(data));
  };


  app.context.vmState = function(state) {
    this.state.vm = this.state.vm || {}
    if (state) {
      if (typeof state.toJSON == 'function') {
        state = state.toJSON();
      }
      Object.assign(this.state.vm, state)
    }
    return this.state.vm
  }



  app.context.viewModel = function(method, path, query, body) {
    return require('viewModels').default.match(this, method, path, query, body);
  }




  async function newToken(create, ctx) {
    if (!create) {
      return false;
    }

    var token = new models.Token({
      logs:[{
        ip: ctx.request.ip,
        date: new Date,
        userAgent: ctx.request.header['user-agent'] || '',
      }],
    });

    await token.save();

    ctx.cookies.set('_token', token.get('_id').toString() + '.' + token.get('random'),  Object.assign({}, require('config/cookie'), {expires: token.get('expiredAt'), path:'/', httponly: true}));
    return ctx.state.token = token;
  }

  app.context.token = async function(create) {
    if (create == 3) {
      return await newToken(this);
    }
    if (this.state.token && create < 2) {
      return this.state.token;
    }
    var cookie = this.cookies.get('_token');
    if (!cookie || cookie.length < 26) {
      return await newToken(create, this);
    }

    cookie = cookie.split('.');
    if (cookie.length != 2) {
      return await newToken(create, this);
    }

    var token
    try {
      token = models.Token.findById(cookie[0]);
      if (create == 2) {
        token = token.read('primary');
      }
      token = await token.exec();
      if (!token) {
        return await newToken(create, this);
      }
      if (cookie[1] !== token.get('random') || (token.get('expiredAt') && token.get('expiredAt') <= (new Date))) {
        return await newToken(create, this);
      }
      let logs = token.get('logs') || [];
      let now = Date.now()
      let set = true;
      for (let log of logs) {
        if (log.ip == this.request.ip && (log.date.getTime() + 1800000) > now) {
          set = false;
          break;
        }
      }

      if (set) {
        if (logs.length && logs[logs.length -1].ip == this.request.ip) {
          logs.pop()
        }
        logs.push({
          ip: this.request.ip,
          date: now,
          userAgent: this.request.header['user-agent'] || '',
        });
        if (logs.length > 100) {
          logs.splice(1, 2)
        }
        token.set('logs', logs);
        await token.save();
      }
    } catch (e) {
      return token ? token : await newToken(create, this);
    }
    return this.state.token = token;
  }





  // public file
  app.use(koaStatic(path.join(__dirname, '../public')));




  // access log
  app.use(async function(ctx, next) {
    var start = new Date;
    await next()
    var ms = new Date - start;
    var userAgent = ctx.request.header['user-agent'] || '';
    console.log(`${ctx.method} ${ctx.status} ${ctx.url} - ${moment(start).format('YYYY-MM-DD hh:mm:ss')} - ${ms}ms - ${ctx.request.ip} - ${userAgent}`);
    ctx.set('X-Response-Time', ms + 'ms');
    ctx.set('X-Version', packageInfo.version);
    ctx.set('X-Author', packageInfo.author);
  });



  // timeout
  app.use(async function(ctx, next) {
    var clear = setTimeout(function() {
      clear = null
      var err = new Error('Request timeout');
      err.status = 502;
      ctx.onerror(err);
    }, 60000);

    try {
      await next()
    } catch (e) {
      throw e
    } finally {
      clearTimeout(clear);
      clear = null
    }
  })


  // views  viewModels
  if (process.env.NODE_ENV == 'development') {
    // delay
    app.use(async function(ctx, next) {
      await new Promise(function(resolve, reject) {
        setTimeout(function() {
          resolve()
        }, 200 + parseInt(Math.random() * 1500));
      });
      await next()
    })

    app.use(function(ctx, next) {
      return require('views/xml').default(ctx, next)
    });
    app.use(function(ctx, next) {
      return require('views/vue').default(ctx, next)
    });
    app.use(function(ctx, next) {
      return require('views/react').default(ctx, next)
    });
    app.use(function(ctx, next) {
      return require('viewModels').default.middleware(ctx, next)
    });
  } else {
    app.use(require('views/xml').default);
    app.use(require('views/vue').default);
    app.use(require('views/react').default);
    app.use(require('viewModels').default.middleware);
  }

  // 404
  app.use(async function(ctx) {
    ctx.throw(http.STATUS_CODES[404], 404);
  })

  // 错误捕获
  app.on('error', function(err, ctx) {
    var date = moment().format('YYYY-MM-DD hh:mm:ss')
    if (err.status >= 500) {
      console.error(date, 'server error :', err, ctx);
    } else {
      console.warn(`${ctx.method} ${ctx.status} ${ctx.url} - ${date} - ${ctx.request.ip} - ${err.message}`);
    }
  });
  return app
}
