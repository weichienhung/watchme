# Watch file changes and upload to remote servers

Q: Why should i need this?  
A: Company ssh policy is a little big complex and i found many sftp plugin didn't work well. But the mac laptop `rsync,sftp` works ok. So i create a simple project to monitor changes and do upload to remote servers

## Dependencies

1. Install facebook's [watchman](https://facebook.github.io/watchman/) on your laptop
2. Install nodejs

## How to use?

1. install the package globally

```
npm install @weichienhung/watchme -g
```

2. prepare config file

e.g: `/User/samuelhung/myproject/` is the folder you want to monitor and auto upload change files.  
create a `.watchme.json` in `/User/samuelhung/myproject/`  
An example of `.watchme.json`

```
{
  "host": "remote server hostname",
  "user": "samuelhung",
  "type": "rsync",
  "remote_path": "/home/samuelhung/myproject",
  "debug": true,
  "ignore_regexes": [
    "watchme\\.json",
    "/venv/",
    "\\.svn/",
    "\\.hg/",
    "\\.git/",
    "\\.bzr",
    "_darcs",
    "CVS",
    "\\.DS_Store",
    "Thumbs\\.db",
    "desktop\\.ini",
    "node_modules/",
    "\\.vscode"
  ]
}
```

You can set a global config file in home dir. e.g: `~/.watchme.json`  
Put common settings. like `ignore_regexes`

```
{
  "ignore_regexes": [
    "watchme\\.json",
    "/venv/",
    "\\.svn/",
    "\\.hg/",
    "\\.git/",
    "\\.bzr",
    "_darcs",
    "CVS",
    "\\.DS_Store",
    "Thumbs\\.db",
    "desktop\\.ini",
    "node_modules/",
    "\\.vscode"
  ]
}
```

The final config are merged from global and local.

3. execute `watchme`

```
> cd /User/samuelhung/myproject/
> watchme
```
