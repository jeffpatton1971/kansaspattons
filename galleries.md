---
layout: page
title: Galleries
permalink: /galleries/
---

{% assign images = site.gallery | sort: "taken_at" | reverse %}

{%- comment -%}
Fallback: include legacy collections if gallery is empty
{%- endcomment -%}
{% if images == empty %}
  {% assign legacy_collections = "gallery-2009-10-18,gallery-2009-10-28,gallery-2009-10-31-1,gallery-2009-10-31-2,gallery-2009-11-02" | split: "," %}
  {% assign images = "" | split: "" %}
  {% for col in legacy_collections %}
    {% assign images = images | concat: site[col] %}
  {% endfor %}
  {% assign images = images | sort: "index" %}
{% endif %}

{% assign current_year = "" %}

{% for image in images %}
  {% assign year = image.taken_at | default: image.date | date: "%Y" %}

  {% if year != current_year %}
    {% unless forloop.first %}
      </div>
    {% endunless %}
    <h2>{{ year }}</h2>
    <div class="gallery-grid">
    {% assign current_year = year %}
  {% endif %}

  <div class="gallery-item">
    <a href="{{ image.url | relative_url }}">
      <img src="{{ image.thumb_url }}" alt="{{ image.title }}">
    </a>
    <p>{{ image.title }}</p>
  </div>

{% endfor %}

</div>
