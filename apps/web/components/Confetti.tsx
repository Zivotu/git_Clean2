'use client';

export function triggerConfetti() {
  const colors = ['#10B981', '#F87171', '#FBBF24', '#60A5FA', '#34D399'];
  const amount = 30;
  for (let i = 0; i < amount; i++) {
    const el = document.createElement('span');
    el.className = 'confetti-piece';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = 1 + Math.random() * 2 + 's';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

export function triggerHearts() {
  // show heart particles near top that float down when someone likes an app
  const colors = ['#EF4444', '#F472B6', '#FB7185', '#F97316', '#F59E0B'];
  const amount = 18;
  for (let i = 0; i < amount; i++) {
    const el = document.createElement('span');
    el.className = 'heart-piece';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.color = colors[Math.floor(Math.random() * colors.length)];
    el.style.fontSize = 12 + Math.floor(Math.random() * 20) + 'px';
    el.style.animationDuration = 0.9 + Math.random() * 1.8 + 's';
    el.innerText = '❤';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

export default triggerConfetti;
