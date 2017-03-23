'use strict'

const path = require('path')
const sh   = require('kool-shell')
const fs   = require('fs-extra')

const steps = 5
const defaultOpts = {
  cache   : path.join(process.cwd(), '.gh-pages-cache'),
  message : ':package: Update gh-pages',
  quiet   : false,
  cwd     : process.cwd(),
  force   : false,
}

function ghpages (copyPath, opts) {
  copyPath = copyPath || process.cwd()
  opts  = Object.assign({}, defaultOpts,  opts || {})

  let remote = ''

  const api = {
    deploy
  }

  const copyOptions = {
    clobber: true,
    dereference: false,
    preserveTimestamps: true,
    filter: function (path) {
      return path !== opts.cache && !(/(^|\/)\.[^\/\.]/g).test(path)
    }
  }


  function deploy () {
    return new Promise((resolve, reject) => {
      isEverythingCommit()
        .then(getRemoteGit)
        .then((res) => { remote = res })
        .then(() => {
          if (!opts.quiet) sh.step(1, steps, 'Rebuilding cache folder...')
        })
        .then(removeCacheFolder)
        .then(createCacheFolder)
        .then(getRemoteGit)
        .then(() => {
          if (!opts.quiet) sh.step(2, steps, 'Init git and gh-pages branch...')
        })
        .then(gitInit)
        .then(addRemoteOrigin)
        .then(checkoutGhPages)
        .then(() => {
          if (!opts.quiet) sh.step(3, steps, 'Copying dist folder...')
        })
        .then(copyFiles)
        .then(() => commitAndPush(opts.message))
        .then(removeCacheFolder)
        .then(() => {
          let components = (/github\.com[:/]([0-9a-z_-]+)\/([0-9a-z_-]+)\.git/gi).exec(remote)
          if (components) resolve(`https://${components[1]}.github.io/${components[2]}/`)
          else resolve(null)
        })
        .catch(reject)
    })
  }

  function getRemoteGit () {
    let errorMsg = 'No remote repository ! Deploy failed.'
    return new Promise((resolve, reject) => {
      sh.silentExec('git', ['config', '--get', 'remote.origin.url'], {cwd: opts.cwd})
        .then((res) => {
          if (!res || res === '') {
            return reject('errorMsg')
          }
          remote = res
          resolve(res)
        })
        .catch((e) => { reject(errorMsg) })
    })
  }

  function gitInit () {
    return sh.silentExec('git', ['init'], { cwd: opts.cache })
  }

  function addRemoteOrigin () {
    return sh.silentExec('git',
      ['remote', 'add', 'origin', remote],
      { cwd: opts.cache })
  }

  function removeCacheFolder () {
    return new Promise((resolve, reject) => {
      fs.remove(opts.cache, e => e ? reject(e) : resolve())
    })
  }

  function createCacheFolder () {
    return new Promise((resolve, reject) => {
      fs.mkdirp(opts.cache, e => e ? reject(e) : resolve())
    })
  }

  function isEverythingCommit () {
    if (opts.force) return Promise.resolve()
    return new Promise((resolve, reject) => {
      sh.silentExec('git', ['status', '--porcelain'], {cwd: opts.cwd})
        .then((res) => {
          if (res !== '') reject('Uncommitted git changes! Deploy failed.')
          else resolve()
        })
        .catch(reject)
    })
  }

  function copyFiles () {
    return new Promise((resolve, reject) => {
      fs.copy(copyPath, opts.cache, copyOptions, (err) => err ? reject(err) : resolve())
    })
  }

  function checkoutGhPages () {
    return new Promise((resolve, reject) => {
      sh.silentExec('git',
        ['show-ref', '--verify', '--opts.quiet', 'refs/heads/gh-pages'],
        {cwd: opts.cache})
        .then(() => {
          sh.silentExec('git', ['checkout', 'gh-pages'], {cwd: opts.cache})
            .then(resolve, reject)
        })
        .catch((e) => {
          sh.silentExec('git', ['checkout', '-b', 'gh-pages'], {cwd: opts.cache})
            .then(resolve, reject)
        })
    })
  }

  function commitAndPush (message) {
    return new Promise((resolve, reject) => {
      if (!opts.quiet) sh.step(4, steps, 'Adding files and commit...')
      sh.silentExec('git', ['add', '-A'], {cwd: opts.cache})
        .then(() => sh.silentExec('git',
          ['commit', '-m', message],
          {cwd: opts.cache}))
        .catch(e => '') // mute error if there is nothing to commit
        .then(() => {
          if (!opts.quiet) sh.step(5, steps, 'Pushing files - this may take a moment...')
        })
        .then(() => sh.silentExec('git',
          ['push', 'origin', 'gh-pages', '--force'],
          {cwd: opts.cache}))
        .then(resolve)
        .catch(reject)
    })
  }

  return api
}

module.exports = ghpages