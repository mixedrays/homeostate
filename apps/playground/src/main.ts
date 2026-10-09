import { playgrounds, type Playground } from "./playgrounds.ts";

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

  const icon = element("img", "icon");
  icon.src = playground.icon;
  icon.alt = "";

  const mark = element("span", "mark");
  mark.append(icon);

  const tags = element("ul", "tags");
  tags.setAttribute("aria-label", "Built with");
  for (const tag of playground.tags) tags.append(element("li", "tag", tag));

  const heading = element("div", "card-heading");
  heading.append(mark, element("h3", "card-title", playground.name));

  link.append(
    heading,
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
