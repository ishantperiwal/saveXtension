// What gets refused while a scan or unsave runs. The server and desktop app send the
// title as the error, and the library adds why, so the same words appear everywhere.
export const BUSY = {
  connect: { title: 'Can’t connect an account during a scan or unsave', why: 'Scans and unsaves use your signed-in accounts, so these can’t change until it ends.' },
  disconnect: { title: 'Can’t disconnect an account during a scan or unsave', why: 'Disconnecting clears a sign-in that it may be using.' },
  unsave: { title: 'Can’t unsave during a scan', why: 'An unsave has to check your saved list, and only one can run at a time.' },
  unsaveAgain: { title: 'Another unsave is still finishing', why: 'Only one can run at a time. Try again in a moment.' },
  scan: { title: 'Can’t start a scan during an unsave', why: 'Only one can run at a time. Try again in a moment.' },
  update: { title: 'Can’t install the update during a scan', why: 'Installing closes the app, which would interrupt the scan.' }
};
// The desktop bridge can wrap an error's text, so match it anywhere in the message.
export const busyNotice = message => Object.values(BUSY).find(notice => String(message).includes(notice.title)) || null;
