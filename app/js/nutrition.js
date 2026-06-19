"use strict";
window.App = window.App || {};

/* לוגיקת יעדים תזונתיים — משותפת לטאב האוכל (תצוגת סיכום) ולטאב השקילה (מחשבון). */
App.nutrition = (function () {
  const S = App.store;

  function targets() { return S.get("food.targets", { kcal: 2200, protein: 150, carbs: 220, fat: 70 }); }
  function saveTargets(v) { S.set("food.targets", v); }
  function profile() { return S.get("food.profile", { sex: "male", age: 30, height: 175, activity: 1.375, goalDir: "lose", goalRate: 0.5 }); }
  function saveProfile(v) { S.set("food.profile", v); }

  // המשקל העדכני ביותר מטאב השקילה (אם קיים)
  function latestWeight() {
    const logs = S.get("weight.logs", []);
    if (!logs.length) return null;
    return logs.slice().sort((a, b) => a.date.localeCompare(b.date)).pop().kg;
  }

  // TDEE (Mifflin-St Jeor) + יעד לפי קצב שבועי. 1 ק"ג שומן ≈ 7700 קק"ל.
  function computeTargets(p, weightKg) {
    const bmr = 10 * weightKg + 6.25 * p.height - 5 * p.age + (p.sex === "male" ? 5 : -161);
    const tdee = bmr * p.activity;
    const dailyAdj = (p.goalRate || 0) * 7700 / 7;
    let kcal = tdee;
    if (p.goalDir === "lose") kcal = tdee - dailyAdj;
    else if (p.goalDir === "gain") kcal = tdee + dailyAdj;
    const floor = p.sex === "male" ? 1500 : 1200;
    let warn = "";
    if (kcal < floor) { warn = `החישוב יצא נמוך מהמומלץ — הועלה ל-${floor} קק"ל. כדאי לבחור קצב מתון יותר.`; kcal = floor; }
    const protein = Math.round(weightKg * (p.goalDir === "lose" ? 2.0 : 1.8));
    const fat = Math.round((kcal * 0.25) / 9);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal), protein, carbs, fat, warn };
  }

  return { targets, saveTargets, profile, saveProfile, latestWeight, computeTargets };
})();
