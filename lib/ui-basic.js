var pretty = require('prettier-bytes')
var gzipSize = require('gzip-size')
var nanoraf = require('nanoraf')

module.exports = createLogUI

var files = [
  'assets',
  'documents',
  'scripts',
  'styles',
  'manifest',
  'service-worker'
]

function createLogUI (compiler, state) {
  Object.assign(state, {
    count: compiler.metadata.count,
    files: {},
    size: 0
  })

  files.forEach(function (filename) {
    state.files[filename] = {
      name: filename,
      progress: 0,
      timestamp: '        ',
      size: 0,
      status: 'pending',
      done: false
    }
  })

  var render = nanoraf(onrender, raf)

  compiler.on('change', function (nodeName, edgeName, nodeState) {
    var node = nodeState[nodeName][edgeName]
    var data = {
      name: nodeName,
      progress: 100,
      timestamp: time(),
      size: 0,
      status: 'done',
      done: true
    }
    state.files[nodeName] = data

    // Only calculate the gzip size if there's a buffer. Apparently zipping
    // an empty file means it'll pop out with a 20B base size.
    if (node.buffer.length) {
      gzipSize(node.buffer, function (err, size) {
        if (err) data.size = node.buffer.length
        else data.size = size
        render()
      })
    }
    render()
  })

  compiler.on('progress', render)
  compiler.on('sse-connect', render)
  compiler.on('sse-disconnect', render)

  var diff = new Differ(state)

  render()
  return render

  function onrender () {
    diff.update(state)
  }
}

function raf (cb) {
  setTimeout(cb, 50)
}

function view (state) {
  var ssrState = 'Pending'
  if (state.ssr) {
    if (state.ssr.success) ssrState = 'Success'
    else ssrState = 'Skipped - ' + state.ssr.error.message
  }
  var SSEStatus = state.sse > 0 ? 'connected' : state.port ? 'ready' : 'starting'
  var httpStatus = state.port ? 'https://localhost:' + state.port : 'starting'

  var allFilesDone = true
  var size = Object.keys(state.files).reduce(function (num, filename) {
    var file = state.files[filename]
    if (file.status !== 'done') allFilesDone = false
    return num + file.size
  }, 0)

  var files = state.files

  var output = [
    `bankai: HTTP Status: ${httpStatus}`,
    `bankai: Live Reload: ${SSEStatus}`,
    `bankai: Server Side Rendering: ${ssrState}`,
    `bankai: assets ${files.assets ? files.assets.status : 'starting'}`,
    `bankai: documents ${files.documents ? files.documents.status : 'starting'}`,
    `bankai: scripts ${files.scripts ? files.scripts.status : 'starting'}`,
    `bankai: styles ${files.styles ? files.styles.status : 'starting'}`,
    `bankai: manifest ${files.manifest ? files.manifest.status : 'starting'}`,
    `bankai: service-worker ${files['service-worker'] ? files['service-worker'].status : 'starting'}`,
    `bankai: Total File size: ${allFilesDone ? pretty(size).replace(' ', '') : 'pending'} `
  ]
  return output
}

function Differ (state) {
  var logLines = view(state)
  console.log(logLines.join('\n'))
  this.oldState = logLines
}

Differ.prototype.update = function (state) {
  var newState = view(state)

  this.oldState.forEach((line, i) => {
    if (line !== newState[i]) console.log(newState[i])
  })

  this.oldState = newState
}

function time () {
  var date = new Date()
  var hours = numPad(date.getHours())
  var minutes = numPad(date.getMinutes())
  var seconds = numPad(date.getSeconds())
  return `${hours}:${minutes}:${seconds}`
}

function numPad (num) {
  if (num < 10) num = '0' + num
  return num
}
