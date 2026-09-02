import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="shell section center" style={{ minHeight: '60vh', display: 'grid', placeContent: 'center' }}>
      <h1 className="flame-text" style={{ fontSize: 'clamp(5rem, 18vw, 10rem)' }}>404</h1>
      <p className="lead" style={{ margin: '1rem 0 2rem' }}>
        That page burned out. Nothing here.
      </p>
      <div className="row row--wrap" style={{ justifyContent: 'center' }}>
        <Link to="/" className="btn">Back to home</Link>
        <Link to="/book" className="btn btn--ghost">Book a station</Link>
      </div>
    </div>
  )
}
