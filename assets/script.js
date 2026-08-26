// Minimal navigation toggle for mobile
document.addEventListener('DOMContentLoaded',function(){
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');
  if(!toggle || !nav) return;
  toggle.addEventListener('click',function(){
    var expanded = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('open');
  });
  document.addEventListener('keydown',function(e){
    if(e.key === 'Escape'){
      if(nav.classList.contains('open')){
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded','false');
        toggle.focus();
      }
    }
  });
});
