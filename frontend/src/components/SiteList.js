import React from "react";
import { Link } from "react-router-dom";

const SiteList = ({ sites }) => (
  <ul>
    {sites.map((site) => (
      <li key={site.id}>
        <Link to={`/site/${site.id}`}>{site.name}</Link>
      </li>
    ))}
  </ul>
);

export default SiteList;
