/* Admin-specific JS */

document.getElementById('halvesEnabled')?.addEventListener('change', function() {
  const box = document.getElementById('halvesBox');
  if (box) box.style.display = this.checked ? '' : 'none';
});

document.getElementById('useOwnHours')?.addEventListener('change', function() {
  const box = document.getElementById('ownHoursBox');
  if (box) box.style.display = this.checked ? '' : 'none';
});

function showPwdReset(userId, userName) {
  document.getElementById('pwdUserId').value     = userId;
  document.getElementById('pwdUserName').textContent = 'Uživatel: ' + userName;
  document.getElementById('newPwd').value        = '';
  document.getElementById('pwdOverlay').classList.add('open');
  document.getElementById('newPwd').focus();
}

document.getElementById('pwdOverlay')?.addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('open');
});
