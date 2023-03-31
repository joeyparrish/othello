# Othello

UI was originally created by joeyparrish on GitHub.

I modified it to include the AI-playing agent that can beat you every time.

To run, just open index.html in your browser. You have an option to enable the "Advanced AI"

This uses a more sophisticated evaluation function that will be you every time even quicker than before.

Multi-player, browser-based, server-less Othello.

Can be played locally or remotely (peer-to-peer) with video chat.

Works offline and as a Progressive Web App (PWA).

https://joeyparrish.github.io/othello/

## Documentation

https://joeyparrish.github.io/othello/how-do-i-play.html

## Privacy Policy

https://joeyparrish.github.io/othello/privacy-policy.html

## Browser Support

This probably won't work on IE.  It should work on any current browser.
If it doesn't work for you, please file a new issue here:
https://github.com/joeyparrish/othello/issues

## License

[GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html)

## Peer-to-Peer Not Working?

If you're hosting your own copy on http (not https), the remote-play features
will not be available.  Remote play uses the WebRTC API from the browser, which
requires a "secure origin" (HTTPS or localhost).

