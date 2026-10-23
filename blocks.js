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
        dropdown: true,
        type: "movement",
        follower: "space",
        cost: 1
    },
    {
        name: "rotate",
        input: true,
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
        follower: "seconds",
        cost: 1
    },
    {
        name: "repeat",
        input: true,
        dropdown: true,
        type: "wrap",
        follower: "times",
        cost: 1
    },
    {
        name: "forever",
        input: false,
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
    }
]