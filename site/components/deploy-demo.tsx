'use client'

import { useEffect, useRef, useState } from 'react'

export function DeployDemo() {
  const section = useRef<HTMLElement>(null)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setStarted(true)
        observer.disconnect()
      }
    }, { threshold: 0.25 })
    if (section.current) observer.observe(section.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={section} className="deploy-section" aria-labelledby="deploy-title">
      <div className="deploy-heading">
        <div>
          <p className="deploy-eyebrow">FROM LOCALHOST TO LIVE</p>
          <h2 id="deploy-title">Made it? Ship it.</h2>
          <p>Build a static site. Deploy it anywhere.</p>
        </div>
      </div>
      <div className={`deploy-terminal${started ? ' is-playing' : ''}`}>
        <div className="deploy-terminal-body">
          <div className="deploy-transcript">
            <div className="deploy-step deploy-step-dev"><code><span className="deploy-prompt">$ </span>npx devjar dev</code></div>
            <div className="deploy-step deploy-step-ready"><code>Local: http://localhost:3000</code></div>
            <div className="deploy-step deploy-step-build"><code><span className="deploy-prompt">$ </span>npx devjar build</code></div>
            <pre className="deploy-step deploy-step-files">{'dist\n├── index.html\n└── _jar      HTML, CSS & JS'}</pre>
            <div className="deploy-step deploy-step-command"><code><span className="deploy-prompt">$ </span>npx vercel dist --prod</code></div>
            <div className="deploy-step deploy-step-upload"><code className="deploy-progress">[====================] uploaded</code></div>
            <div className="deploy-step deploy-step-done"><code>+ Your website is live.</code></div>
          </div>
          <div className="deploy-browser" role="img" aria-label="Website preview: localhost:3000 becomes your-site.vercel.app after deployment">
              <div className="deploy-browser-address" aria-hidden="true">
                <span className="deploy-url-local">localhost:3000</span>
                <span className="deploy-url-live">your-site.vercel.app</span>
              </div>
            <div className="deploy-preview">
              <span className="deploy-preview-label">A LITTLE IDEA, OUT IN THE WORLD</span>
              <div className="deploy-preview-title">Hello,<br />internet.</div>
              <p>A space for what comes next.</p>
              <div className="deploy-preview-art" aria-hidden="true"><span /><span /><span /></div>
            </div>
          </div>
        </div>
      </div>
      <p className="deploy-note">Deploy example uses <a href="https://vercel.com/docs/cli/deploy">Vercel CLI</a>. Sign in and follow the setup prompts on your first deploy.</p>
    </section>
  )
}
