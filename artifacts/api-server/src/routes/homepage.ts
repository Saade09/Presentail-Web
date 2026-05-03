import { Router, type IRouter } from "express";
import {
  GetHomepageBannersQueryParams,
  GetHomepageBannersResponse,
} from "@workspace/api-zod";
import { HOMEPAGE_BANNERS } from "../data/homepageBanners";

const router: IRouter = Router();

// Returns the active hero banner carousel for the supplied country.
// Filtering by isActive, the optional startsAt/endsAt window, and country
// code (with "*" matching every country) plus sortOrder ordering all happen
// here so clients can render the response verbatim.
router.get("/homepage/banners", (req, res) => {
  const { countryCode } = GetHomepageBannersQueryParams.parse(req.query);
  const code = (countryCode ?? "*").toUpperCase();
  const now = Date.now();

  const banners = HOMEPAGE_BANNERS.filter((b) => {
    if (!b.isActive) return false;
    if (b.countryCode !== "*" && b.countryCode.toUpperCase() !== code) return false;
    if (b.startsAt && new Date(b.startsAt).getTime() > now) return false;
    if (b.endsAt && new Date(b.endsAt).getTime() < now) return false;
    return true;
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  const data = GetHomepageBannersResponse.parse({ banners });
  res.json(data);
});

export default router;
