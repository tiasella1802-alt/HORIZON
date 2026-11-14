// Short background for students and the public: why landing near the Moon's south pole is hard.
import Icon, { IconName } from "./Icon";

const ITEMS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "ice",
    title: "Why go there",
    text: "Craters near the south pole that never see sunlight probably hold ice. Ice can become drinking water, air and rocket fuel. That is why Artemis and other missions are headed there.",
  },
  {
    icon: "lowsun",
    title: "The Sun stays low",
    text: "At the pole the Sun circles just above the horizon instead of rising overhead. A hill tens of kilometres away can hide it for days, and a solar-powered lander shuts down.",
  },
  {
    icon: "signal",
    title: "Earth can disappear",
    text: "Radio needs a clear line to Earth. From the pole, Earth sits low in the sky and drifts in and out of view, so a ridge can cut the link.",
  },
  {
    icon: "rocket",
    title: "It has ended missions",
    text: "Chandrayaan-3 went dark at sunset and never woke up. Two later US landers were also cut short by low sunlight. See Real missions.",
  },
];

export default function WhyItMatters() {
  return (
    <section className="panel why">
      <h2>Why the south pole is hard</h2>
      <div className="why-list-rows">
        {ITEMS.map((c) => (
          <div key={c.title} className="why-item">
            <Icon name={c.icon} className="row-icon" />
            <div>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </div>
          </div>
        ))}
      </div>
      <h3>Who it's for</h3>
      <ul className="why-list">
        <li><strong>Mission teams:</strong> a quick first check of sites and dates, especially after a launch slip.</li>
        <li><strong>Teachers and students:</strong> real NASA data, and any spot you want to try.</li>
        <li><strong>Anyone following Artemis:</strong> why landing sites and dates are picked so carefully.</li>
      </ul>
    </section>
  );
}
