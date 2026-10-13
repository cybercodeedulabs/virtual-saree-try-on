import { SHOWROOM } from '../config';

const formatPrice = (n) => `${SHOWROOM.currency}${Number(n).toLocaleString('en-IN')}`;

export default function ProductPanel({ item, draping, index, total }) {
  if (!item) return null;
  return (
    <section className="product" aria-live="polite">
      <p className="product-count">
        {index >= 0 ? `${index + 1} of ${total}` : 'Uploaded photo'}
      </p>
      <h1 className="product-name">{item.name}</h1>
      <dl className="product-facts">
        <div><dt>Fabric</dt><dd>{item.fabric}</dd></div>
        <div><dt>Colours</dt><dd>{item.colour}</dd></div>
        {item.code && <div><dt>Code</dt><dd>{item.code}</dd></div>}
      </dl>
      {item.price != null && SHOWROOM.currency && <p className="product-price">{formatPrice(item.price)}</p>}
      <p className={`draping ${draping ? 'is-on' : ''}`} aria-hidden={!draping}>
        Draping on the mannequin
      </p>
    </section>
  );
}
