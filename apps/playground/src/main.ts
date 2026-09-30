import { playgrounds, type Playground } from "./playgrounds.ts";
import "./styles.css";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function card(playground: Playground) {
  const link = element("a", "card");
  link.href = playground.url;
  link.style.setProperty("--accent", playground.accent);

  const mark = element("span", "mark", playground.name[0]);
  mark.setAttribute("aria-hidden", "true");

  const tags = element("ul", "tags");
  tags.setAttribute("aria-label", "Built with");
  for (const tag of playground.tags) tags.append(element("li", "tag", tag));

  link.append(
    mark,
    element("h3", "card-title", playground.name),
    element("p", "card-description", playground.description),
    tags,
    element("code", "command", playground.command),
    element("span", "action", "Open playground →"),
  );

  const item = document.createElement("li");
  item.append(link);
  return item;
}

document.getElementById("playgrounds")!.append(...playgrounds.map(card));
