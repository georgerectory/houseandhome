// Marketplace. What to hunt for second hand, what it is worth, and
// what has turned up.
//
// Read on a phone, usually standing next to a listing, so the order is
// the order of the questions: where do I stand, what should I do this
// week, what is in play, what next, where to look - and only then the
// record and the reference.
//
// There is nothing here to press that changes anything. A find is
// judged in a conversation with Claude, which writes it; this page
// shows the result, and says on its face how much of every figure
// rests on thresholds nobody has confirmed.
import { requireAuth } from '../core/auth.js';
import { mountShell, showProperty, render } from '../core/shell.js';
import { load, loadMarketplace } from '../core/store.js';
import { buildModel } from './marketplace/model.js';
import { pageHtml } from './marketplace/view.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');
mountShell('marketplace.html', { user });

const [d, market] = await Promise.all([load(), loadMarketplace()]);
showProperty(d.property, d.properties);
render('[data-page-root]', pageHtml(buildModel(market)));
