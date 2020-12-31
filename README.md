# Watch file changes and upload to remote servers

Q: Why should i need this?  
A: Company ssh policy is a little big complex and i found many sftp plugin didn't work well. But the mac laptop `rsync,sftp` works ok. So i create a simple project to monitor changes and do upload to remote servers

## Dependencies

1. Install facebook's [watchman](https://facebook.github.io/watchman/) on your laptop
2. Install nodejs

## How to use?

1. Install the package globally

```
npm install -g
```

2. Prepare config file under project root folder

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
