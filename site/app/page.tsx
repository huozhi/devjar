import { Codesandbox } from '../ui/codesandbox'

const codeSample4 = {
  'index.js': `\
  import { useState } from 'react'

  import Text from './text'
  import './styles.css'

  export default function App() {
    const [num, inc] = useState(1)
    
    return (
      <div>
        <h2 class="text-3xl">
          hello <Text />
        </h2>

        <p>Volume {Array(num % 6).fill('●').join('')}</p>
        <button className='button' onClick={() => inc(num + 1)}>increase</button>
      </div>
    )
  }`,
  './text.js': `\
  import React from 'react'

  export default function Text() {
    return <b>devjar</b>
  }`,
  './styles.css': `\
  html {
    font-family: ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji
  }
  .title {
    color: rgba(51, 65, 85);
    font-weight: 300;
    transition: color 0.2s ease-in-out;
  }
  .title:hover {
    color: rgba(23, 119, 195, 0.8);
  }

  .button {
    background: #eee;
    border: 1px solid #222;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 700;
    transition: color 0.2s ease-in-out;
  }
  .button:hover {
    background: #ddd;
    color: #222;
  }
  .button:active {
    background: #ccc;
    color: #222;
  }
  `,
}


const codeSample2 = {
  'index.js': `\
import React, { useState } from "react";

function App() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div
      style={{
        backgroundColor: darkMode ? "#333" : "#fff",
        color: darkMode ? "#fff" : "#000",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <h1>{darkMode ? "Dark Mode" : "Light Mode"}</h1>
      <button onClick={() => setDarkMode(!darkMode)}>
        Toggle {darkMode ? "Light" : "Dark"} Mode
      </button>
    </div>
  );
}

export default App;
`,
}

const codeSample3 = {
  'index.js': `\
  import React, { useState } from "react";

const quotes = [
  "The only limit to our realization of tomorrow is our doubts of today.",
  "The future belongs to those who believe in the beauty of their dreams.",
  "Do not watch the clock. Do what it does. Keep going.",
  "You miss 100% of the shots you don't take.",
  "Life is 10% what happens to us and 90% how we react to it."
];

function App() {
  const [quote, setQuote] = useState(quotes[0]);

  const generateQuote = () => {
    const randomIndex = Math.floor(Math.random() * quotes.length);
    setQuote(quotes[randomIndex]);
  };

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h1>Random Quote</h1>
      <p>"{quote}"</p>
      <button onClick={generateQuote}>New Quote</button>
    </div>
  );
}

export default App;
`,
}

const codeSample1 = {
  'index.js': `\
export default function App() {
  return "hello world"
}
`,
}

export default function Page() {
  return (
    <main>
      <div>
        <h1>Devjar</h1>
        <p>
          A live-code runtime for React, running directly in the browser. Perfect for interactive demos, documentation,
          and real-time code previews. Simple to integrate and highly flexible for any React project.
        </p>
        <br />  
      </div>

      <div className='codesandboxes'>
        <Codesandbox files={codeSample1} />
        <Codesandbox files={codeSample4} />
        <Codesandbox files={codeSample2} />
        <Codesandbox files={codeSample3} />
      </div>
    </main>
  )
}
