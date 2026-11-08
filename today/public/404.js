// Keep the error page independent of authentication and the app framework.
document.documentElement.classList.remove("boot");
const back = document.querySelector("#back");
back?.addEventListener("click", () => {
  // A new tab can contain about:blank in its history. Without a referring
  // page, take the visitor home rather than back to an empty browser tab.
  if (history.length > 1 && document.referrer) history.back();
  else location.assign("/");
});
if (back) back.hidden = false;
