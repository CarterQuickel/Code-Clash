module.exports = [
    {
        name: "start",
        input: false,
        dropdown: false,
        type: "control",
        follower: "",
        cost: 0
    },
    {
        name: "move", 
        input: false,
        dropdown: false,
        type: "movement",
        follower: "",
        cost: 1
    },
    {
        name: "rotate",
        input: false,
        dropdown: true,
        type: "movement",
        follower: "degrees",
        cost: 1
    },
    {
        name: "wait",
        input: true,
        dropdown: false,
        type: "control",
        follower: "actions",
        cost: 1
    },
    {
        name: "repeat",
        input: true,
        dropdown: false,
        type: "wrap",
        follower: "times",
        cost: 0
    },
    {
        name: "if",
        input: true,
        dropdown: false,
        type: "wrap",
        follower: "",
        cost: 1
    },
    {
        name: "wait until",
        input: true,
        dropdown: false,
        type: "wrap",
        follower: "",
        cost: 1
    },
    {
        name: "repeat until",
        input: true,
        dropdown: false,
        type: "wrap",
        follower: "",
        cost: 1
    },
    {
        name: "fire",
        input: false,
        dropdown: false,
        type: "action",
        follower: "",
        cost: 2
    },
    {
        name: "jump",
        input: false,
        dropdown: false,
        type: "action",
        follower: "",
        cost: 2
    },
    {
        name: "self-destruct",
        input: false,
        dropdown: false,
        type: "action",
        follower: "",
        cost: 3
    },
    {
        name: "shield",
        input: false,
        dropdown: false,
        type: "action",
        follower: "",
        cost: 3
    },
    {
        name: "damage received",
        input: false,
        dropdown: false,
        type: "variable",
        follower: "",
        cost: 0
    },
    {
        name: "ammo",
        input: false,
        dropdown: false,
        type: "variable",
        follower: "",
        cost: 0
    },
    {
        name: "enemy distance",
        input: false,
        dropdown: false,
        type: "variable",
        follower: "",
        cost: 0
    },
    {
        name: "health",
        input: false,
        dropdown: false,
        type: "variable",
        follower: "",
        cost: 0
    },
    {
        name: "",
        input: true,
        dropdown: false,
        type: "variable",
        follower: "",
        cost: 0
    },
    {
        name: ">",
        input: false,
        dropdown: false,
        type: "operator",
        follower: "",
        cost: 0
    },
    {
        name: "<",
        input: false,
        dropdown: false,
        type: "operator",
        follower: "",
        cost: 0
    },
    {
        name: "=",
        input: false,
        dropdown: false,
        type: "operator",
        follower: "",
        cost: 0
    },
    {
        name: "and",
        input: false,
        dropdown: false,
        type: "operator",
        follower: "",
        cost: 0
    },
    {
        name: "reload",
        input: false,
        dropdown: false,
        type: "action",
        follower: "",
        cost: 0
    },
    {
        name: "place mine",
        input: false,
        dropdown: false,
        type: "action",
        follower: "",
        cost: 2
    },
]