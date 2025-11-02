const token = `eyJhbGciOiJSUzI1NiIsImtpZCI6IjU0NTEzMjA5OWFkNmJmNjEzODJiNmI0Y2RlOWEyZGZlZDhjYjMwZjAiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiQW1pciDFoGVyYmnEhyIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NLYlRIbjQ3d3F1QzJVbXFUdHJJQ05LQU9Ra1VsYWhRUksxNGxRU2xRd3IwU19kbVU4U0pRPXM5Ni1jIiwicm9sZSI6ImFkbWluIiwiYWRtaW4iOnRydWUsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9jcmVhdGV4LWUwY2NjIiwiYXVkIjoiY3JlYXRleC1lMGNjYyIsImF1dGhfdGltZSI6MTc2MjA5MjA3NSwidXNlcl9pZCI6IndMTGh3NlJ3c2dPMFFtVFVJMndFWVc4TW1GMzMiLCJzdWIiOiJ3TExodzZSd3NnTzBRbVRVSTJ3RVlXOE1tRjMzIiwiaWF0IjoxNzYyMDkyNDc3LCJleHAiOjE3NjIwOTYwNzcsImVtYWlsIjoiYW1pci5zZXJiaWNAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZ29vZ2xlLmNvbSI6WyIxMTAxMTQxOTY4NjU3MzIzOTQ0NTYiXSwiZW1haWwiOlsiYW1pci5zZXJiaWNAZ21haWwuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoiZ29vZ2xlLmNvbSJ9fQ.gHXVw8nLjHICH_3DXcOufWoaF8zK6hlceZmmw89urzjq6u-HfYyLyiVKdfUVwctBYym1N9KgqKeTTWbY6VjBSlACNiYLf5bzXhXcdmxxuPEy1tjohSLP5uK3NjR9lsthS9F2ZVzk29ib-i8jWgR69do5UCGnUDyxY0-Mo8ECYrN-CXD4B0Zr1cibPM5voH-epId2fqigwAsgfp1ywRPBHugydIQfLTNfrJGVQJQZmzd5Bd2KVSlgcQybiyaS3FJttcacs0u-buZH-l0UzHDt8XZA6vtV-lpo2XSSUSoXiNupYCAjCsrS-M0aMdOo1dH1i3fOv4zP0AVZZ6Hw-NzdwQ`;

(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/storage?ns=room-test-1', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Thesara-Scope': 'shared'
      }
    });
    console.log('status', res.status);
    console.log('headers', Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log('body:', text);
  } catch (err) {
    console.error('error', err?.message || err);
  }
})();
